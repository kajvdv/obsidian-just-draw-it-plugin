import { syntaxTree } from '@codemirror/language';
import { Plugin, Editor, moment, App } from 'obsidian';
import {
  StateField,
  StateEffect,
  Transaction,
} from '@codemirror/state';
import {
  ViewUpdate,
  PluginValue,
  EditorView,
  ViewPlugin,
  WidgetType
} from '@codemirror/view';
import {Facet} from "@codemirror/state"
import {Extension} from "@codemirror/state"
import {DecorationSet} from "@codemirror/view"
import {Decoration} from "@codemirror/view"
import {RangeSetBuilder} from "@codemirror/state"




// function getRange(node: SyntaxNode)
let app: App | null = null



class CanvasWidget extends WidgetType {
  canvas: HTMLCanvasElement | null = null;

  toDOM(view: EditorView) {
    const filePath = 'testfile.png'
    this.canvas = document.createElement("canvas")
    const canvas = this.canvas
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Could not get context");
    
    const imageFile = app?.vault.getFileByPath(filePath)
    if (!imageFile) throw new Error("Could not find the canvas file")
    app?.vault.readBinary(imageFile)
      .then(buffer => {
        const blob = new Blob([buffer], { type: 'image/png' });
        const bitmap = createImageBitmap(blob)
        return bitmap
      })
      .then(bitmap => {
        ctx.drawImage(bitmap, 0, 0) 
      });
    
    const canvasRect = canvas.getBoundingClientRect();
    canvas.style.width = '100%'
    canvas.width = 700 // This is the width of the notes
    ctx.scale(canvas.width / canvasRect.width, canvas.height / canvasRect.height)
    ctx.fillStyle = 'red';
    ctx.fillRect(10, 10, 100, 100)


    
    
    canvas.addEventListener('mousemove', ev => {
      ctx.fillRect(ev.offsetX, ev.offsetY, 2, 2)
    })

    canvas.addEventListener('click', async ev => {
      if (app == null) return
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
        console.log("found file", file.path)
        break;
      }
      if (pngFile !== null) {
        app.vault.modifyBinary(pngFile, buffer)
      } else {
        app.vault.createBinary(filePath, buffer)
      }
    })
    return canvas
  }


  get estimatedHeight() {
    return this.canvas?.height || 0
  }
}

const canvasDecoration = Decoration.replace({
  widget: new CanvasWidget(),
  block: true,
})


const canvasField = StateField.define<DecorationSet>({
  create() {
    const set =  Decoration.none
    return set
  },
  update(canvasDecs, tr) {
    const builder = new RangeSetBuilder<Decoration>();
    syntaxTree(tr.state).iterate({
      enter(node) {
        if (node.type.name == "hmd-barelink_link") {
          const text = tr.state.doc.sliceString(node.from, node.to)
          if (text == "canvas") {
            const range = canvasDecoration.range(node.from - 1, node.to + 1)
            builder.add(range.from, range.to, range.value)
          }
        }
      }
    })
    return builder.finish()
  },
  provide(field) {
    return EditorView.decorations.from(field)
  },
})


export default class ExamplePlugin extends Plugin {
  async onload() {
    this.registerEditorExtension(canvasField);
    app = this.app;

    
    this.registerMarkdownPostProcessor((element, context) => {
      // Replace all canvas tags with images
    });
  }
}