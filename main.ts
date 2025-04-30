import { syntaxTree } from '@codemirror/language';
import { SyntaxNode } from '@lezer/common'
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
import {Extension, RangeSet} from "@codemirror/state"
import {DecorationSet} from "@codemirror/view"
import {Decoration} from "@codemirror/view"
import {RangeSetBuilder} from "@codemirror/state"

import Konva from './node_modules/konva';


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
    console.log("Could not find the canvas file", filePath)
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

  let tool = "line"
  let color = "white"
  let mousedownPosition: {x: number, y: number} | null = null
  let lastImage = ctx.getImageData(0, 0, canvas.width, canvas.height)

  canvas.addEventListener('mousedown', ev => {
    if (ev.button == 0) {
      ctx.fillStyle = color
      ctx.strokeStyle = color
      mousedownPosition = {x: ev.offsetX, y: ev.offsetY}
      lastImage = ctx.getImageData(0, 0, canvas.width, canvas.height)
    }
  })
  
  canvas.addEventListener('mousemove', ev => {
    if (mousedownPosition) {
      switch (tool) {
        case "rectangle":
        case 'line': 
          if (!lastImage) {
            console.log("lastImage not there")
            return
          }
          ctx.putImageData(lastImage, 0, 0)
        break;
      }

      switch(tool) {
        case "free": {
          ctx.fillRect(ev.offsetX * scaleX, ev.offsetY * scaleY, 2, 2)
        } break;
        case "rectangle": 
          ctx.strokeRect(mousedownPosition.x, mousedownPosition.y, ev.offsetX - mousedownPosition.x, ev.offsetY - mousedownPosition.y)
          break;
        case "line": 
          ctx.beginPath()
          ctx.moveTo(mousedownPosition.x, mousedownPosition.y)
          ctx.lineTo(ev.offsetX, ev.offsetY)
          ctx.closePath()
          ctx.stroke()
          break;
      }
    }
  })

  canvas.addEventListener('mouseup', async ev => {
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
    const container = initCanvas(canvas)

    canvas.addEventListener('mouseup', async ev => {
      // TODO: save button so user know when its saved
      saveImage(canvas, this.app, filePath)
    })
    return container
  }


  get estimatedHeight() {
    return this.canvas?.height || 0
  }
}


class TestWidget extends WidgetType {
  constructor(text: string) {
    super()
    console.log("Creating new widget with text", text)
  }

  toDOM(view: EditorView) {
    const image = new Image()
    image.src = "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Ftse1.mm.bing.net%2Fth%2Fid%2FOIP.wnpxq0AIyD66m1VHdaoSygHaHa%3Fpid%3DApi&f=1&ipt=a3ad9fc906f9af9ef721a67f49edeeb8e6d5be5a0ba973e49da1d6cf1a384f20&ipo=images"
    return image
  }

  destroy() {
    console.log("Destroying widget")
  }
}


function findDecorationByFrom(decs: DecorationSet, from: number) {
  const i = decs.iter(from-1)
  console.log("Getting of range", i)
  if (!i) {
    return null
  }
  return i.from == from ? i.value : null
}


export default class ExamplePlugin extends Plugin {
  widgets: Map<number, CanvasWidget> = new Map();

  getWidget = (filePath: string, from: number) => {
    let widget = this.widgets.get(from)
    if (!widget) {
      widget = new CanvasWidget(filePath, this.app) 
      this.widgets.set(from, widget)
      return widget
    } else {
      return widget
    }
  }

  async onload() {
    const app = this.app
    const widgets = this.widgets
    const getWidget = this.getWidget
    const tagOffset = 2

    const canvasField = StateField.define<DecorationSet>({
      create() {
        return Decoration.none
      },
      update(canvasDecs, tr: Transaction) {
        console.log(tr.changes)
        canvasDecs = canvasDecs.map(tr.changes)
        const linkNodes: SyntaxNode[] = []
        syntaxTree(tr.state).iterate({
          enter(node) {
            if (node.type.name == "hmd-internal-link"
              && tr.state.doc.sliceString(node.from-3, node.from-2) == "?"
            ) {
              linkNodes.push(node.node)
              const filePath = tr.state.doc.sliceString(node.from, node.to)
              const decoration = findDecorationByFrom(canvasDecs, node.to + tagOffset)
              if (!decoration) {
                // throw new Error("Did not find the decoration")
                canvasDecs = canvasDecs.update({
                  add: [Decoration.widget({
                    widget: new CanvasWidget(filePath, app),
                    block: true,
                  }).range(node.to+tagOffset, node.to+tagOffset)]
                })
              }
            }
          }
        })
        return canvasDecs.update({
          filter: (from: number, to: number, value: Decoration) => {
            for (let node of linkNodes) {
              if (node.to + tagOffset === from) {
                return true
              }
            }
            return false
          }
        })
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