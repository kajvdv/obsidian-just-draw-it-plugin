import { syntaxTree } from '@codemirror/language';
import { SyntaxNode } from '@lezer/common'
import {
  Plugin,
  Editor,
  MarkdownView,
  moment,
  App,
  Notice,
  setIcon
} from 'obsidian';
import {
  StateField,
  StateEffect,
  Transaction,
  Range,
  EditorSelection
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


class Brush {
  unloadTool: (() => void) | null = null
  stage: Konva.Stage
  color: String
  active = false
  isPaint = false
  lastLine: null | Konva.Line = null
  constructor(stage: Konva.Stage, color: String) {
    this.stage = stage 
    this.color = color 
  }
  
  mouseDown() {
    const layer = new Konva.Layer();
    this.isPaint = true;
    const pos = this.stage.getPointerPosition();
    if (!pos) throw new Error("Could not get pointer position")
    this.lastLine = new Konva.Line({
      stroke: "black",
      strokeWidth: 5,
      globalCompositeOperation: 'source-over',
      // round cap for smoother lines
      lineCap: 'round',
      lineJoin: 'round',
      // add point twice, so we have some drawings even on a simple click
      points: [pos.x, pos.y, pos.x, pos.y],
    });
    layer.add(this.lastLine);
    this.stage.add(layer)
  }

  mouseUp() {
    this.isPaint = false;
  }

  mouseMove() {
    if (!this.isPaint) {
      return;
    }
    const pos = this.stage.getPointerPosition();
    if (!pos || !this.lastLine)
      throw new Error("Could not get pointer position")
    const newPoints = this.lastLine.points().concat([pos.x, pos.y]);
    this.lastLine.points(newPoints);
  }
  
}

class Rectangle {
  unloadTool: (() => void) | null = null
  stage: Konva.Stage
  color: String
  active = false
  isDown = false
  anchor: null | Konva.Vector2d = null
  lastLayer: null | Konva.Layer = null
  constructor(stage: Konva.Stage, color: String) {
    this.stage = stage 
    this.color = color 
  }
  
  mouseDown() {
    this.isDown = true
    const pos = this.stage.getPointerPosition();
    if (!pos)
      throw new Error("Could not get position")
    this.anchor = pos
  }

  mouseUp() {
    this.isDown = false
    this.lastLayer = null
  }

  mouseMove() {
    if (!this.isDown)
      return
    if (this.lastLayer)
      this.lastLayer.destroy();
    const pos = this.stage.getPointerPosition();
    if (!pos)
      throw new Error("Could not get position")
    if (!this.anchor)
      throw new Error("No anchor position to draw the rectangle")
    const rect = new Konva.Rect({
      x: this.anchor.x,
      y: this.anchor.y,
      width: pos.x - this.anchor.x,
      height: pos.y - this.anchor.y,
      stroke: 'black',
      strokeWidth: 2
    })
    const layer = new Konva.Layer();
    this.lastLayer = layer
    this.stage.add(layer)
    layer.add(rect)
  }
}


class Toolbar {
  selectedColor: string = "#dadada"
  selectedTool: string = ''
  stage: Konva.Stage
  app: App
  filePath: string
  color: String = String("black")

  constructor(stage: Konva.Stage, app: App, filePath: string) {
    this.stage = stage 
    this.app = app 
    this.filePath = filePath 
  }

  loadEventHandlers() {
    const brushTool = new Brush(this.stage, 'black')
    const rectTool = new Rectangle(this.stage, 'black')
    this.stage.on('mousedown touchstart', ev => {
      if (this.selectedTool === "brush") {
        brushTool.mouseDown()
      } else if (this.selectedTool === "rect") {
        rectTool.mouseDown()
      }
    });
    
    this.stage.on('mouseup touchend', ev => {
      if (this.selectedTool === "brush") {
        brushTool.mouseUp()
      } else if (this.selectedTool === "rect") {
        rectTool.mouseUp()
      }
    });

    this.stage.on('mousemove touchmove', ev => {
      if (this.selectedTool === "brush") {
        brushTool.mouseMove()
      } else if (this.selectedTool === "rect") {
        rectTool.mouseMove()
      }
    });
  }

  save() {    
    saveImage(this.stage, this.app, this.filePath)
    new Notice(`Drawing saved as ${this.filePath}`);
    this.selectedTool = ""
  }

  undo() {

  }

  redo() {

  }
  
  brush() {
    if (this.selectedTool === 'brush') {
      this.selectedTool = ""
    } else {
      this.selectedTool = "brush"
    }
    return this.selectedTool
  }

  rectangle() {
    if (this.selectedTool === 'rect') {
      this.selectedTool = ""
    } else {
      this.selectedTool = "rect"
    }
    return this.selectedTool
  }

  showPalette = false
  palette() {
    this.showPalette = !this.showPalette
  }
}


function constructToolbar(stage: Konva.Stage, app: App, filePath: string) {
  let unloadTool: (() => void) | undefined = undefined
  const toolbarElement = document.createElement('div')
  toolbarElement.className = "canvas-toolbar"

  let tool = ""
  let color = '#dadada'

  const saveBtn  = document.createElement('button')
  const undoBtn  = document.createElement('button')
  const redoBtn  = document.createElement('button')
  const brushBtn = document.createElement('button')
  const rectBtn  = document.createElement('button')
  const colorBtn = document.createElement('button')

  const toolbar = new Toolbar(stage, app, filePath)
  toolbar.loadEventHandlers()
  
  saveBtn.className = 'toolbar-btn'
  setIcon(saveBtn, 'save')
  saveBtn.addEventListener('click', ev => {
    toolbar.save()
    brushBtn.className = 'toolbar-btn'
    rectBtn.className = 'toolbar-btn'
  })

  undoBtn.className = 'toolbar-btn'
  setIcon(undoBtn, 'undo')
  undoBtn.addEventListener('click', ev => {
    new Notice(`Undo button not implemented`);
  })

  redoBtn.className = 'toolbar-btn'
  setIcon(redoBtn, 'redo')
  redoBtn.addEventListener('click', ev => {
    new Notice(`Redo button not implemented`);
  })
  
  brushBtn.className = 'toolbar-btn'
  setIcon(brushBtn, 'brush')
  brushBtn.addEventListener('click', ev => {
    if (toolbar.brush()) {
      brushBtn.classList.add("selected-btn")
    } else {
      brushBtn.className = "toolbar-btn"
      rectBtn.className = "toolbar-btn"
    }
  })

  rectBtn.className = 'toolbar-btn'
  setIcon(rectBtn, 'square')
  rectBtn.addEventListener('click', ev => {
    if (toolbar.rectangle()) {
      rectBtn.classList.add("selected-btn")
    } else {
      brushBtn.className = "toolbar-btn"
      rectBtn.className = "toolbar-btn"
    }
  })

  colorBtn.className = "toolbar-btn"
  const picker = document.createElement('div')
  picker.style.position = 'absolute'
  picker.style.display = 'flex'
  picker.style.backgroundColor = 'grey'
  picker.style.top = '60px'
  picker.style.zIndex = '9999'
  picker.style.borderRadius = '5px'
  const colors = ['var(--text-normal)', 'black', '#df4b26', 'blue', 'yellow']
  for (let color of colors) {
    const colorElement = document.createElement('div')
    colorElement.className = "pick-color"
    colorElement.style.backgroundColor = color
    colorElement.addEventListener('click', ev => {
      colorBtn.style.color = color
    })
    picker.appendChild(colorElement)
  }


  let showPicker = true
  setIcon(colorBtn, 'palette')
  colorBtn.addEventListener('click', ev => {
    // new Notice(`Undo button not implemented`);
    showPicker = !showPicker
    if (showPicker) {
      colorBtn.appendChild(picker)
    } else {
      picker.remove()
    }
  })

  toolbarElement.appendChild(saveBtn)
  toolbarElement.appendChild(undoBtn)
  toolbarElement.appendChild(redoBtn)
  toolbarElement.appendChild(brushBtn)
  toolbarElement.appendChild(rectBtn)
  toolbarElement.appendChild(colorBtn)
  colorBtn.appendChild(picker) // Remove when done with development

  return toolbarElement
}


class CanvasWidget extends WidgetType {
  filePath: string
  app: App
  stage: Konva.Stage
  container: HTMLDivElement
  cursorEventHandler: () => undefined = () => undefined

  constructor(filePath: string, app: App) {
    super()
    this.filePath = filePath
    this.app = app
    this.container = document.createElement("div")
    // this.container.style.display = 'flex'
    this.container.className = "canvas-container"
    const konvaContainer = document.createElement('div')
    this.stage = new Konva.Stage({
      container: konvaContainer,
      width: CANVAS_WIDTH,
      height: CANVAS_WIDTH / 1.4142,
    });
    const stage = this.stage
    const toolbar = constructToolbar(stage, this.app, this.filePath)
    this.container.appendChild(toolbar)
    this.container.appendChild(konvaContainer)
  
    loadImageOnStage(stage, this.app, this.filePath)
  }

  toDOM(view: EditorView) {
    this.cursorEventHandler = () => {
      const rect = this.container.getBoundingClientRect()
      const pos = view.posAtCoords(rect)
      if (!pos)
        return undefined
      view.dispatch(view.state.update({selection: EditorSelection.cursor(pos)}))
    }
    this.container.addEventListener("mousedown", this.cursorEventHandler)
    return this.container
  }

  destroy() {
    this.container.removeEventListener('mousedown', this.cursorEventHandler)
  }
}


function findDecorationByFrom(decs: DecorationSet, from: number) {
  const i = decs.iter(from-1)
  if (!i) {
    return null
  }
  return i.from == from ? i.value : null
}


export default class ExamplePlugin extends Plugin {
  async onload() {
    const app = this.app
    const tagOffset = 2
    const canvasField = StateField.define<DecorationSet>({
      create() {
        return Decoration.none
      },
      update(canvasDecs, tr: Transaction) {
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
              // TODO: Fix behaviour on pressing enter after tag
              const line = tr.state.doc.lineAt(node.to)
              if (!decoration) {
                canvasDecs = canvasDecs.update({
                  add: [
                    Decoration.widget({
                      widget: new CanvasWidget(filePath, app),
                      side: 1
                    }).range(node.to+tagOffset, node.to+tagOffset),
                  ]
                })
              }
            }
          }
        })
        canvasDecs = canvasDecs.update({
          filter: (from: number, to: number, value: Decoration) => {
            for (let node of linkNodes) {
              if (node.to + tagOffset === from) {
                return true
              }
            }
            return false
          }
        })
        return canvasDecs
      },

      provide(field) {
        return EditorView.decorations.from(field)
      },
    })

    const hideTag = StateField.define<DecorationSet>({
      create() {
        return Decoration.none
      },
      update(_, tr: Transaction) {
        const decos: Range<Decoration>[] = []
        const cursor = tr.state.selection.main.head
        const currentLine = tr.state.doc.lineAt(cursor)
        syntaxTree(tr.state).iterate({
          enter(node) {
            if (node.type.name == "hmd-internal-link"
              && tr.state.doc.sliceString(node.from-3, node.from-2) == "?"
            ) {
              if (!(node.from-3 <= cursor && cursor <= node.to+2)) {
                const charBefore = tr.state.doc.sliceString(node.from-4, node.from-3)
                if (charBefore == '\n') {
                  decos.push(Decoration.replace({}).range(node.from-4, node.to+2))
                } else {
                  decos.push(Decoration.replace({}).range(node.from-3, node.to+2))
                }
              }
            }
          }
        })
        return Decoration.set(decos)
      },
      provide(field) {
        return EditorView.decorations.from(field)
      }
    })
    
    this.registerEditorExtension([
      canvasField,
      hideTag
    ]);
    
    this.registerMarkdownPostProcessor((element, context) => {
      // Replace all canvas tags with images
      const sectionInfo = context.getSectionInfo(element)
      if (!sectionInfo)
        throw new Error("Could not get section info when rendering to markdown")
      const canvasTagsRegex = /\?\[\[.*\]\]/g
      const tags = sectionInfo.text.matchAll(canvasTagsRegex)
      const embedLinks = element.querySelectorAll('a.internal-link')
      if (!embedLinks)
        return
      for (let link of embedLinks) {
        if (link.previousSibling?.textContent?.at(-1) === "?") {
          const filePath = link.textContent
          if (!filePath)
            continue//on your journey
          const file = this.app.vault.getFileByPath(filePath)
          if (!file) {
            console.error("Could not find file to render markdown");
            continue
          }
          this.app.vault.readBinary(file)
          .then(arrayBuffer => {
            const blob = new Blob([arrayBuffer], { type: 'image/png' });
            const imgURL = URL.createObjectURL(blob);
            const img = document.createElement('img');
            img.src = imgURL
            link.parentElement?.insertBefore(img, link.nextSibling)//
            link.previousSibling?.remove()
            link.remove()
          })
        }
      }
    });
  }

}