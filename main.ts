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

import Konva from './node_modules/konva';


const CANVAS_WIDTH = 700


async function saveImage(stage: Konva.Stage, app: App, filePath: string) {
  const buffer = await new Promise<ArrayBuffer>((resolve) => {
    stage.toBlob({callback: (blob) => {
      if (blob === null) throw new Error("Blob was null")
      blob.arrayBuffer().then(buffer => resolve(buffer))
    }, mimeType: 'image/png'});  
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


function loadImageOnStage(stage: Konva.Stage, app: App, filePath: string) {
  const imageFile = app.vault.getFileByPath(filePath)
  if (!imageFile) {
    console.log("Could not find the file", filePath)
  } else {
    const layer = new Konva.Layer();
    app.vault.readBinary(imageFile)
      .then(buffer => {
        const blob = new Blob([buffer], { type: 'image/png' });
        const bitmap = createImageBitmap(blob, {
          resizeWidth: CANVAS_WIDTH,
        })
        return bitmap
      })
      .then(bitmap => {
        const image = new Konva.Image({
          image: bitmap
        })
        layer.add(image)
        stage.height(image.height())
        stage.width(image.width())
      });
      stage.add(layer);
  }
}


function initFreeDrawing(stage: Konva.Stage) {
  const layer = new Konva.Layer();
  stage.add(layer);
  
  let isPaint = false;
  let mode = 'brush';
  let lastLine: Konva.Line;

  stage.on('mousedown touchstart', function (e) {
    isPaint = true;
    const pos = stage.getPointerPosition();
    if (!pos) throw new Error("Could not get pointer position")
    lastLine = new Konva.Line({
      stroke: '#df4b26',
      strokeWidth: 5,
      globalCompositeOperation:
        mode === 'brush' ? 'source-over' : 'destination-out',
      // round cap for smoother lines
      lineCap: 'round',
      lineJoin: 'round',
      // add point twice, so we have some drawings even on a simple click
      points: [pos.x, pos.y, pos.x, pos.y],
    });
    layer.add(lastLine);
  });

  stage.on('mouseup touchend', function () {
    isPaint = false;
  });

  // and core function - drawing
  stage.on('mousemove touchmove', function (e) {
    if (!isPaint) {
      return;
    }

    // prevent scrolling on touch devices
    e.evt.preventDefault();

    const pos = stage.getPointerPosition();
    if (!pos) throw new Error("Could not get pointer position")
    const newPoints = lastLine.points().concat([pos.x, pos.y]);
    lastLine.points(newPoints);
  });
}


class CanvasWidget extends WidgetType {
  filePath: string
  app: App
  stage: Konva.Stage
  container: HTMLDivElement

  constructor(filePath: string, app: App) {
    super()
    this.filePath = filePath
    this.app = app
    this.container = document.createElement("div")
    this.stage = new Konva.Stage({
      container: this.container,
      width: CANVAS_WIDTH,
      height: CANVAS_WIDTH / 1.4142,
    });
    const stage = this.stage
  
    loadImageOnStage(stage, this.app, this.filePath)
    initFreeDrawing(stage)
  }

  toDOM(view: EditorView) {
    return this.container
  }

  destroy(dom: HTMLElement) {
    const state = this.stage
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