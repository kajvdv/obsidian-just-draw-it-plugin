import { syntaxTree } from '@codemirror/language';
import { Plugin, Editor, moment, App } from 'obsidian';
import {
  StateField,
  StateEffect,
  Transaction,
  Range,
} from '@codemirror/state';
import {
  ViewUpdate,
  PluginValue,
  EditorView,
  ViewPlugin,
  WidgetType,
} from '@codemirror/view';
import {Facet} from "@codemirror/state"
import {Extension} from "@codemirror/state"
import {DecorationSet} from "@codemirror/view"
import {Decoration} from "@codemirror/view"
import {RangeSetBuilder} from "@codemirror/state"



const CANVAS_WIDTH = 700


async function saveImage(canvas: HTMLCanvasElement, app: App, filePath: string) {
  const buffer = await new Promise<ArrayBuffer>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob === null) throw new Error("Blob was null")
      blob.arrayBuffer().then(buffer => resolve(buffer))
    }, 'image/png');  
  })
  const files = app.vault.getFiles()
  let pngFile = null
  for (let file of files) if (filePath === file.path) {
    pngFile = file
    break;
  }
  if (pngFile !== null) {
    console.log("Saving image in exiting file %s", pngFile.name)
    app.vault.modifyBinary(pngFile, buffer)
  } else {
    console.log("Creating new file to save image")
    app.vault.createBinary(filePath, buffer)
  }
}


function loadImageOnCanvas(canvas: HTMLCanvasElement, app: App, filePath: string) {
  const imageFile = app.vault.getFileByPath(filePath)
  if (!imageFile) {
    console.error("Could not find the canvas file", filePath)
    canvas.width = 700 // This is the width of the notes
    canvas.height = 700 / 1.41421356237 // This is the width of the notes
  } else {
    app.vault.readBinary(imageFile)
      .then(buffer => {
        const blob = new Blob([buffer], { type: 'image/png' });
        const bitmap = createImageBitmap(blob, {
          resizeWidth: CANVAS_WIDTH,
        })
        return bitmap
      })
      .then(bitmap => {
        const ctx = canvas.getContext("2d")
        if (!ctx) throw new Error("Could not get 2d context");
        
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        ctx.drawImage(bitmap, 0, 0) 
      });
  }
}


function hydrateCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2d context");

  const canvasRect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / canvasRect.width
  const scaleY = canvas.height / canvasRect.height

  let drawing = false;
  let isMouseDown = false
  let tool = "rectangle"
  let color = "white"
  let mousedownPosition: {x: number, y: number} | null = null
  canvas.addEventListener('mousedown', ev => {
    isMouseDown = true
    ctx.fillStyle = color
    mousedownPosition = {x: ev.offsetX, y: ev.offsetY}
  })
  
  canvas.addEventListener('mousemove', ev => {
    switch(tool) {
      case "free": {
        if (isMouseDown) {
          ctx.fillRect(ev.offsetX * scaleX, ev.offsetY * scaleY, 2, 2)
        }
      } break;
    }
    // const canvasRect = canvas.getBoundingClientRect();
    // if (!drawing) return
    // const scaleX = canvas.width / canvasRect.width
    // const scaleY = canvas.height / canvasRect.height
    // ctx.fillRect(ev.offsetX * scaleX, ev.offsetY * scaleY, 2, 2)
  })

  canvas.addEventListener('mouseup', async ev => {
    isMouseDown = false
    switch (tool) {
      case 'rectangle': {
        if (!mousedownPosition) {
          console.log("No starting point to draw rect")
          return
        }
        ctx.strokeRect(mousedownPosition.x, mousedownPosition.y, ev.offsetX - mousedownPosition.x, ev.offsetY - mousedownPosition.y)
      } break;
    }
    mousedownPosition = null
  })
}


function initCanvas(canvas: HTMLCanvasElement) {
  const container = document.createElement('div')
  container.appendChild(canvas)
  hydrateCanvas(canvas)
  const toolbar = document.createElement('div')

  toolbar.style.position = 'relative';
  toolbar.style.width = "600px";
  toolbar.style.height = "50px";
  // toolbar.style.bottom = "-100px";
  toolbar.style.backgroundColor = "white";
  container.appendChild(toolbar)
  return container
}


class CanvasWidget extends WidgetType {
  canvas: HTMLCanvasElement | null = null;
  filePath: string
  app: App

  constructor(filePath: string, app: App) {
    super()
    this.filePath = filePath
    this.app = app
  }

  toDOM(view: EditorView) {
    const filePath = this.filePath
    this.canvas = document.createElement("canvas")
    const canvas = this.canvas
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Could not get context");
    
    loadImageOnCanvas(canvas, this.app, filePath)
  
    
    // canvas.style.width = '100%'
    // canvas.style.border = '2px solid white'
    // ctx.fillStyle = 'white';


    
    const container = initCanvas(canvas)

    canvas.addEventListener('mouseup', async ev => {
      saveImage(canvas, this.app, filePath)
    })
    return container
  }


  get estimatedHeight() {
    return this.canvas?.height || 0
  }
}







export default class ExamplePlugin extends Plugin {
  widgets: Map<string, CanvasWidget> = new Map();

  getWidget = (filePath: string) => {
    let widget = this.widgets.get(filePath)
    if (!widget) {
      widget = new CanvasWidget(filePath, this.app) 
      this.widgets.set(filePath, widget)
      return widget
    } else {
      return widget
    }
  }

  async onload() {
    const app = this.app
    const widgets = this.widgets
    const getWidget = this.getWidget

    const canvasField = StateField.define<DecorationSet>({
      create() {
        const set =  Decoration.none
        return set
      },
      update(canvasDecs, tr: Transaction) {
        const decos: Range<Decoration>[] = []
        syntaxTree(tr.state).iterate({
          enter(node) {
            if (node.type.name == "hmd-internal-link"
              && tr.state.doc.sliceString(node.from-3, node.from-2) == "?"
            ) {
              const filePath = tr.state.doc.sliceString(node.from, node.to)
              decos.push(Decoration.widget({
                widget: getWidget(filePath),
                block: true,
              }).range(node.to + 2, node.to + 2))
            }
          }
        })
        return Decoration.set(decos)
      },

      provide(field) {
        return EditorView.decorations.from(field)
      },
    })
    
    this.registerEditorExtension(canvasField);
    
    this.registerMarkdownPostProcessor((element, context) => {
      // Replace all canvas tags with images
      const filePath = 'testfile.png'
      const file = this.app.vault.getFileByPath(filePath)
      if (!file) return
      console.log("Rendering image")
      this.app.vault.readBinary(file)
        .then(arrayBuffer => {
          const blob = new Blob([arrayBuffer], { type: 'image/png' });
          const imgURL = URL.createObjectURL(blob);
    
          // Create and insert the <img> tag
          const img = document.createElement('img');
          img.src = imgURL
          element.appendChild(img)
        })
    });
  }

}