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


function getFreeDrawHandlers(stage: Konva.Stage) {
  const layer = new Konva.Layer();
  stage.add(layer);
  let isPaint = false;
  let lastLine: Konva.Line;

  function mouseDownHandler() {
    isPaint = true;
    const pos = stage.getPointerPosition();
    if (!pos) throw new Error("Could not get pointer position")
    lastLine = new Konva.Line({
      stroke: '#df4b26',
      strokeWidth: 5,
      globalCompositeOperation: 'source-over',
      // round cap for smoother lines
      lineCap: 'round',
      lineJoin: 'round',
      // add point twice, so we have some drawings even on a simple click
      points: [pos.x, pos.y, pos.x, pos.y],
    });
    layer.add(lastLine);
  }

  function mouseUpHandler() {
    isPaint = false
  }

  function mouseMoveHandler() {
    if (!isPaint) {
      return;
    }
    const pos = stage.getPointerPosition();
    if (!pos)
      throw new Error("Could not get pointer position")
    const newPoints = lastLine.points().concat([pos.x, pos.y]);
    lastLine.points(newPoints);
  }

  return {
    mouseDownHandler,
    mouseUpHandler,
    mouseMoveHandler
  }
}


function initFreeDrawing(stage: Konva.Stage) {
  const handlers = getFreeDrawHandlers(stage)

  stage.on('mousedown touchstart', handlers.mouseDownHandler);
  stage.on('mouseup touchend', handlers.mouseUpHandler);
  const f: Konva.KonvaEventListener<typeof stage, any> = (e) => {
    e.evt.preventDefault();
    handlers.mouseMoveHandler()
  }
  stage.on('mousemove touchmove', f);
  return function cleanupHandlers() {
    stage.off('mousedown touchstart', handlers.mouseDownHandler)
    stage.off('mouseup touchend', handlers.mouseUpHandler);
    stage.off('mousemove touchmove', f)
  }
}


function getRectDrawHandlers(stage: Konva.Stage) {
  const layer = new Konva.Layer()
  stage.add(layer)
  
  let isDown = false
  let anchor: Konva.Vector2d
  let lastRect: Konva.Rect | null
  
  function mouseDownHandler() {
    isDown = true
    const pos = stage.getPointerPosition();
    if (!pos)
      throw new Error("Could not get position")
    anchor = pos
  }

  function mouseUpHandler() {
    isDown = false
    lastRect = null
  }

  function mouseMoveHandler() {
    if (!isDown)
      return
    if (lastRect)
      lastRect.destroy();
    const pos = stage.getPointerPosition();
    if (!pos)
      throw new Error("Could not get position")
    const rect = new Konva.Rect({
      x: anchor.x,
      y: anchor.y,
      width: pos.x - anchor.x,
      height: pos.y - anchor.y,
      stroke: 'white',
      strokeWidth: 2
    })
    lastRect = rect
    layer.add(rect)
  }

  return {
    mouseDownHandler,
    mouseUpHandler,
    mouseMoveHandler
  }
}


function initRectDrawing(stage: Konva.Stage) {
  const handlers = getRectDrawHandlers(stage)

  stage.on('mousedown touchstart', handlers.mouseDownHandler);
  stage.on('mouseup touchend', handlers.mouseUpHandler);
  const f: Konva.KonvaEventListener<typeof stage, any> = (e) => {
    e.evt.preventDefault();
    handlers.mouseMoveHandler()
  }
  stage.on('mousemove touchmove', f);
  return function cleanupHandlers() {
    // TODO: Remove layers after added to the stage
    stage.off('mousedown touchstart', handlers.mouseDownHandler)
    stage.off('mouseup touchend', handlers.mouseUpHandler);
    stage.off('mousemove touchmove', f)
  }
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
    this.container.style.display = 'flex'
    const konvaContainer = document.createElement('div')
    this.stage = new Konva.Stage({
      container: konvaContainer,
      width: CANVAS_WIDTH,
      height: CANVAS_WIDTH / 1.4142,
    });
    this.container.appendChild(konvaContainer)
    const stage = this.stage
  
    loadImageOnStage(stage, this.app, this.filePath)
    let unloadTool: (() => void) | undefined = undefined
    const toolbar = document.createElement('div')
    toolbar.style.position = 'relative'

    let tool = ""

    const saveBtn = document.createElement('button')
    saveBtn.className = 'toolbar-btn'
    setIcon(saveBtn, 'save')
    saveBtn.addEventListener('click', ev => {
      saveImage(stage, app, filePath)
      new Notice(`Drawing saved as ${filePath}`);
      if (unloadTool)
        unloadTool();
      tool = ""
      brushBtn.className = 'toolbar-btn'
      rectBtn.className = 'toolbar-btn'
    })
    const brushBtn = document.createElement('button')
    brushBtn.className = 'toolbar-btn'
    setIcon(brushBtn, 'brush')
    brushBtn.addEventListener('click', ev => {
      if (unloadTool)
        unloadTool();
      if (tool != "brush") {
        unloadTool = initFreeDrawing(stage)
        tool = 'brush'
        brushBtn.classList.add('selected-btn')
        rectBtn.className = 'toolbar-btn'
      } else {
        tool = ""
        brushBtn.className = 'toolbar-btn'
        unloadTool = undefined
      }
    })

    const rectBtn = document.createElement('button')
    rectBtn.className = 'toolbar-btn'
    setIcon(rectBtn, 'square')

    
    toolbar.appendChild(saveBtn)
    toolbar.appendChild(brushBtn)
    toolbar.appendChild(rectBtn)
    rectBtn.addEventListener('click', ev => {
      if (unloadTool)
        unloadTool();
      if (tool != "rect") {
        unloadTool = initRectDrawing(stage)
        tool = 'rect'
        rectBtn.classList.add('selected-btn')
        brushBtn.className = 'toolbar-btn' 
      } else {
        tool = ""
        rectBtn.className = 'toolbar-btn'
        unloadTool = undefined
      }
    })
    
    this.container.appendChild(toolbar)
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
                decos.push(Decoration.replace({}).range(node.from-4, node.to+2))
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