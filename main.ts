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
    
    const imageFile = this.app.vault.getFileByPath(filePath)
    if (!imageFile) {
      console.error("Could not find the canvas file", filePath)
      canvas.width = 700 // This is the width of the notes
      canvas.height = 700 / 1.41421356237 // This is the width of the notes
    } else {
      this.app.vault.readBinary(imageFile)
        .then(buffer => {
          const blob = new Blob([buffer], { type: 'image/png' });
          const bitmap = createImageBitmap(blob)
          return bitmap
        })
        .then(bitmap => {
          canvas.width = bitmap.width
          canvas.height = bitmap.height
          ctx.drawImage(bitmap, 0, 0) 
        });
    }
    
    canvas.style.width = '100%'
    canvas.style.border = '2px solid white'
    ctx.fillStyle = 'white';


    
    let drawing = false;
    canvas.addEventListener('mousedown', ev => {
      drawing = true
    })
    
    canvas.addEventListener('mousemove', ev => {
      const canvasRect = canvas.getBoundingClientRect();
      if (!drawing) return
      const scaleX = canvas.width / canvasRect.width
      const scaleY = canvas.height / canvasRect.height
      ctx.fillRect(ev.offsetX * scaleX, ev.offsetY * scaleY, 2, 2)
    })

    canvas.addEventListener('mouseup', async ev => {
      drawing = false;
      const buffer = await new Promise<ArrayBuffer>((resolve) => {
        canvas.toBlob((blob) => {
          if (blob === null) throw new Error("Blob was null")
          blob.arrayBuffer().then(buffer => resolve(buffer))
        }, 'image/png');  
      })
      const files = this.app.vault.getFiles()
      let pngFile = null
      for (let file of files) if (filePath === file.path) {
        pngFile = file
        console.log("found file", file.path)
        break;
      }
      if (pngFile !== null) {
        this.app.vault.modifyBinary(pngFile, buffer)
      } else {
        this.app.vault.createBinary(filePath, buffer)
      }
    })
    return canvas
  }


  get estimatedHeight() {
    return this.canvas?.height || 0
  }
}







export default class ExamplePlugin extends Plugin {
  async onload() {
    const app = this.app
    const widgets: Map<string, CanvasWidget> = new Map()
    const canvasField = StateField.define<DecorationSet>({
      create() {
        const set =  Decoration.none
        return set
      },
      update(canvasDecs, tr) {
        function getWidget(filePath: string) {
          let widget = undefined
          widget = widgets.get(filePath)
          if (!widget) {
            widget = new CanvasWidget(filePath, app) 
            widgets.set(filePath, widget)
            return widget
          } else {
            return widget
          }
        }
        
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