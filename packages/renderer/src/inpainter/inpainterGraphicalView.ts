import { EventEmitter } from 'events'
import * as Tone from 'tone'
import log from 'loglevel'
import $ from 'jquery'
import { debounce, throttled } from 'chart.js/helpers'
import screenfull from 'screenfull'

import { PlaybackManager } from '../playback'
import { Inpainter } from './inpainter'

import { VariableValue } from '../cycleSelect'
import { ScrollLockSimpleBar } from '../utils/simplebar'
import {
  CartesianScaleOptions,
  Chart,
  ScriptableScaleContext,
  Tick,
  TickOptions,
  Ticks,
} from 'chart.js'

const chartsFontFamily = "'Fira-Sans'"
Chart.defaults.font.family = chartsFontFamily

export abstract class InpainterGraphicalView<
  DataT = unknown,
  InpainterT extends Inpainter<DataT, never> = Inpainter<DataT, never>,
  PlaybackManagerT extends PlaybackManager<InpainterT> = PlaybackManager<InpainterT>,
  GranularityT = unknown
> extends EventEmitter {
  readonly inpainter: InpainterT

  abstract get isRendered(): boolean

  protected triggerReflow(): void {
    const _ = document.body.clientWidth
    return
  }

  // force repaint to display proper pointer `hover` position
  triggerRepaint(): void {
    this.interfaceContainer.style.opacity = '0'
    setTimeout(() => {
      this.interfaceContainer.style.opacity = '1'
    }, 1)
  }

  protected errorTimeout?: NodeJS.Timeout = undefined
  protected flashError(): void {
    if (this.errorTimeout != undefined) {
      clearTimeout(this.errorTimeout)
    }
    this.container.classList.remove('error')
    this.triggerReflow()
    this.container.classList.add('error')
    this.errorTimeout = setTimeout(() => {
      this.container.classList.remove('error')
    }, 2000)
  }

  protected onInpainterError(message?: string): void {
    // TODO(@REDACTED, 2022/09/22): display error message, e.g. via the Notification API
    this.flashError()
  }
  protected onInpainterBusy(): void {
    this.disableChanges()
  }
  protected onInpainterReady(): void {
    this.enableChanges()
  }
  protected onInpainterChange(data: DataT): void {
    if (!this.isRendered) {
      this.render()
    }
    this.refresh()
    this.refreshNowPlayingDisplay()
  }

  // additional parameters to pass to the API requests based on the interface's state
  get queryParameters(): string[] {
    return []
  }

  readonly playbackManager: PlaybackManagerT

  readonly container: HTMLElement
  readonly interfaceContainer: HTMLElement

  // enable this if the scrollbars can be displayed over the content
  // to ensure visibility of the underlying content
  abstract readonly useTransparentScrollbars: boolean

  toggleTransparentScrollbars(): void {
    this.container.classList.toggle(
      'transparent-scrollbar',
      this.useTransparentScrollbars
    )
  }

  protected resizeTimeoutDuration = 16
  // default, dummy timeout
  protected resizeTimeout = setTimeout(() => {
    return
  }, 0)

  readonly granularitySelect: VariableValue<GranularityT>
  get granularity(): GranularityT {
    return this.granularitySelect.value
  }
  protected abstract onchangeGranularity(): void

  protected displayLoop: Tone.Loop = new Tone.Loop()
  protected scrollUpdateLoop: Tone.Loop = new Tone.Loop()

  abstract readonly dataType: 'sheet' | 'spectrogram'

  // render the interface on the DOM and bind callbacks
  public render(...args: any[]): void {
    this.emit('busy')
    this._render(...args)
    this.emit('ready')
  }
  protected abstract _render(...args: any[]): void

  // re-render with current parameters
  public refresh(): void {
    this._refresh()
  }

  // subclass this
  protected abstract _refresh(): void

  callToActionHighlightedCellsNumber = 8

  // triggers an animation to catch the user's eye
  public callToAction(
    interval: number = 100,
    highlightedCellsNumber = this.callToActionHighlightedCellsNumber
  ): void {
    function delay(ms: number): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, ms))
    }

    let promise = Promise.resolve()

    const randomIndexes: number[] = Array(highlightedCellsNumber)
      .fill(0)
      .map(() => {
        return Math.floor(Math.random() * this.numInteractiveElements)
      })

    randomIndexes.forEach((index) => {
      const element = this.getInterfaceElementByIndex(index)

      promise = promise.then(() => {
        if (element != null) {
          element.classList.remove('highlight')
          this.triggerReflow()
          element.classList.add('highlight')
        }
        return delay(interval)
      })
    })
  }

  // retrieve interactive elements of the interface by index
  abstract getInterfaceElementByIndex(index: number): Element | null

  abstract get numInteractiveElements(): number

  protected _disabled = false
  get disabled(): boolean {
    return this._disabled
  }
  set disabled(state: boolean) {
    this._disabled = state
    this.toggleBusyClass(this.disabled)
  }

  protected disableChanges(): void {
    this.disabled = true
  }
  protected enableChanges(): void {
    this.disabled = false
  }

  constructor(
    inpainter: InpainterT,
    playbackManager: PlaybackManagerT,
    container: HTMLElement,
    granularitySelect: VariableValue<GranularityT>, // CycleSelect<EditToolT>,
    displayUpdateRate: Tone.Unit.Time
  ) {
    super()
    this.inpainter = inpainter
    this.inpainter.on('busy', () => this.onInpainterBusy())
    this.inpainter.on('ready', () => this.onInpainterReady())
    this.inpainter.on('successful-request', () => {
      // successull-request is triggered as soon as a request is finished,
      // this helps in clearing the selection before lifting the `disabled` overlay
      this.clearSelection()
    })
    this.inpainter.on('change', (data) => this.onInpainterChange(data))
    this.inpainter.on('error', () => this.onInpainterError())

    this.container = container
    this.container.classList.add('inpainter')
    this.container.classList.add('initializing')

    this.interfaceContainer = document.createElement('div')
    this.interfaceContainer.classList.add('inpainter-interface-container')
    this.container.appendChild(this.interfaceContainer)

    this.granularitySelect = granularitySelect
    this.granularitySelect.on('change', () => this.onchangeGranularity())

    this.registerRefreshOnResizeListener()

    this.displayUpdateRate = displayUpdateRate
    this.scheduleDisplayLoop()

    this.toggleTransparentScrollbars()
    this.registerDropHandlers()

    this.playbackManager = playbackManager
    this.playbackManager.transport.on('start', () => {
      this.container.classList.add('playing')
    })
    this.playbackManager.transport.on('stop', () => {
      this.container.classList.remove('playing')
    })
    this.playbackManager.context.on('statechange', () => {
      // reschedule the display loop if the context changed,
      // this can happen when the value of context.lookAhead is changed
      // e.g. when toggling between built-in playback with a safety latency
      // and low-latency MIDI-based playback
      this.scheduleDisplayLoop()
    })

    this.once('ready', () => {
      this.container.classList.remove('initializing')
      // ensure interface is painted before lifting the `disabled` overlay
      this.triggerRepaint()
      this.disabled = false
      this.registerCallback()
    })

    this.timeScaleContainer.classList.add(
      'inpainter-scale-container',
      'inpainter-time-scale-container'
    )
    this.timeScaleContainer.appendChild(this.timeScaleCanvas)
  }

  protected registerDropHandlers() {
    this.container.addEventListener('drop', (e) => {
      e.preventDefault()
      this.container.classList.remove('in-dragdrop-operation')
      void this.dropHandler(e)
    })
    this.container.addEventListener('dragenter', (e) => {
      e.preventDefault()
      this.container.classList.add('in-dragdrop-operation')
    })
    this.container.addEventListener('dragleave', (e) => {
      if (
        e.currentTarget != null &&
        e.relatedTarget != null &&
        (e.currentTarget as HTMLElement).contains(
          // see https://stackoverflow.com/a/54271161
          e.relatedTarget as HTMLElement
        )
      ) {
        return
      }
      e.preventDefault()
      this.container.classList.remove('in-dragdrop-operation')
    })
  }

  protected toggleBusyClass(isBusy: boolean): void {
    this.container.classList.toggle('busy', isBusy)
  }

  protected static blockEventCallback: (e: Event) => void = (e: Event) => {
    // block propagation of events in bubbling/capturing
    e.stopPropagation()
    e.preventDefault()
  }

  protected registerRefreshOnResizeListener(): void {
    window.addEventListener(
      'resize',
      // () => this.refresh()
      throttled(() => this.refresh(), this.resizeTimeoutDuration)
    )
  }

  get interactionTarget(): HTMLElement {
    return this.interfaceContainer
  }
  abstract get canTriggerInpaint(): boolean

  protected _inInteraction = false
  protected get inInteraction(): boolean {
    return this.inInteraction
  }
  protected set inInteraction(inInteraction: boolean) {
    this.container.classList.toggle('in-interaction', inInteraction)
    this._inInteraction = inInteraction
  }

  protected abstract regenerationCallback(): Promise<void>

  protected _releaseCallback = () => {
    this.disableChanges()
    if (this.canTriggerInpaint) {
      this.regenerationCallback.bind(this)()
    } else {
      this.enableChanges()
    }
    this.inInteraction = false
  }

  protected registerReleaseCallback(): void {
    // call the actual callback on pointer release to allow for click and drag
    document.addEventListener('pointerup', this._releaseCallback, {
      once: true,
    })
  }

  protected removeReleaseCallback(): void {
    document.removeEventListener('pointerup', this._releaseCallback)
  }

  abstract clearSelection(): void

  protected cancelCurrentInteraction(): void {
    this.clearSelection()
    this.removeReleaseCallback()
  }

  protected onInteractionStart = () => {
    if (!this.disabled) {
      if (this.scrollbar != null) {
        this.scrollbar.toggleScrollLock('x', true)
      }
      this.inInteraction = true
      this.registerReleaseCallback()
    }
  }

  protected registerCallback(): void {
    // TODO(@REDACTED, 2022/08/01): potential memory leak
    if (this.interactionTarget != null) {
      this.interactionTarget.removeEventListener(
        'pointerdown',
        this.onInteractionStart
      )
      this.interactionTarget.addEventListener(
        'pointerdown',
        this.onInteractionStart
      )
    }
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key == 'Escape') {
        this.cancelCurrentInteraction()
      }
    })
  }

  // set currently playing interface position by progress ratio
  protected abstract setCurrentlyPlayingPositionDisplay(progress: number): void

  protected scrollbar: ScrollLockSimpleBar | null = null
  protected readonly nowPlayingDisplayCallbacks: ((
    progress?: number
  ) => void)[] = [
    (totalProgress?: number): void => {
      this.setCurrentlyPlayingPositionDisplay(
        totalProgress ?? this.playbackManager.totalProgress
      )
    },
  ]

  refreshNowPlayingDisplay(): this {
    this.nowPlayingDisplayCallbacks.forEach((callback) => callback())
    return this
  }

  protected shortScroll: JQuery.Duration = 50

  protected get scrollableElement(): Element {
    return this.container.getElementsByClassName('simplebar-content-wrapper')[0]
  }

  protected targetScrollRatio: number = 1 / 2

  protected getTargetScrollPosition_px(): number {
    // return the current position within the sheet display
    const visibleWidth: number = this.scrollableElement.clientWidth
    const centerPosition: number =
      this.scrollableElement.scrollLeft + visibleWidth * this.targetScrollRatio

    return centerPosition
  }

  protected resetScrollPosition(): void {
    this.scrollTo(0)
  }

  protected scrollTo(totalProgress: number): void {
    this.scrollToStep(this.totalProgressToStep(totalProgress))
  }

  protected abstract totalProgressToStep(totalProgress: number): number
  get currentlyPlayingStep(): number {
    return this.totalProgressToStep(this.playbackManager.totalProgress)
  }

  protected scrollToPosition(targetPosition_px: number): void {
    if (this.scrollbar == null || this.scrollbar.isScrollLocked) {
      return
    }
    const currentDisplayWidth_px: number = this.scrollableElement.clientWidth
    const newScrollLeft_px =
      targetPosition_px - currentDisplayWidth_px * this.targetScrollRatio

    const currentCenterPosition_px: number = this.getTargetScrollPosition_px()
    if (currentCenterPosition_px > targetPosition_px) {
      // scrolling to a previous position: instant scroll
      $(this.scrollableElement).stop(true, false)
      this.scrollableElement.scrollLeft = newScrollLeft_px
    } else {
      // synchronize scrolling with the tempo for smooth scrolling
      const scrollDuration_ms = this.scrollIntervalDuration_seconds * 1000
      $(this.scrollableElement).stop(true, false).animate(
        {
          scrollLeft: newScrollLeft_px,
        },
        scrollDuration_ms,
        'linear'
      )
    }
  }

  // Duration between two scroll snap points,
  //  e.g. 1 beat for a sheet in NONOTO
  //  or 1 second for sounds in NOTONO using a 1-seconds-resolution VQ-VAE
  abstract readonly autoScrollIntervalDuration: Tone.Unit.Time
  abstract readonly autoScrollUpdateInterval: Tone.Unit.Time
  readonly displayUpdateRate: Tone.Unit.Time

  // Return the time in seconds between beats
  get scrollIntervalDuration_seconds(): number {
    return this.playbackManager.transport.toSeconds(
      this.autoScrollIntervalDuration
    )
  }

  protected scrollToStep(step: number): void {
    // scroll display to keep the center of the currently playing
    // quarter note container in the center of the sheet window
    //
    // We do this by scheduling a scroll to the next step with duration
    // equal to one quarter-note time (dependent on the current BPM)
    // Inversely, scrolling to a position earlier in time (e.g. when pressing
    // stop or reaching the end of the loop) is super-fast
    let targetPosition_px: number
    try {
      // try to retrieve the position of the (potentially non-existing) next
      // quarter-note
      const nextStepBoxDelimiters = this.getTimecontainerPosition(step)
      targetPosition_px = nextStepBoxDelimiters.right
    } catch (e) {
      // reached last container box
      // FIXME make and catch specific error
      const lastStepIndex = this.totalProgressToStep(1) - 1
      const lastStepPosition = this.getTimecontainerPosition(lastStepIndex)
      log.debug(
        `Moving to end, lastStepPosition: [${lastStepPosition.left}, ${lastStepPosition.right}]`
      )

      // right-side delimiter of the last quarter note box
      const containerRight = lastStepPosition.right
      targetPosition_px = containerRight
    }
    this.scrollToPosition(targetPosition_px)
  }

  protected abstract getTimecontainerPosition(step: number): {
    left: number
    right: number
  }

  protected scheduleDisplayLoop(): void {
    this.displayLoop.dispose()
    this.scrollUpdateLoop.dispose()

    const scrollCallback = (time: Tone.Unit.Time) => {
      const draw = this.playbackManager.transport.context.draw
      draw.schedule(
        (): void => this.scrollTo(this.playbackManager.totalProgress),
        this.playbackManager.transport.toSeconds(time)
      )
    }
    this.scrollUpdateLoop = new Tone.Loop(
      scrollCallback,
      this.autoScrollUpdateInterval
    ).start(0)

    const drawCallback = (time: Tone.Unit.Time) => {
      const totalProgress = this.playbackManager.totalProgress
      const draw = this.playbackManager.transport.context.draw
      this.nowPlayingDisplayCallbacks.forEach((callback) =>
        draw.schedule(() => {
          if (document.visibilityState == 'visible') {
            callback(totalProgress)
          }
        }, this.playbackManager.transport.toSeconds(time))
      )
    }
    this.displayLoop = new Tone.Loop(
      drawCallback,
      this.displayUpdateRate
    ).start(0)
  }

  async dropHandler(e: DragEvent): Promise<void> {
    if (e.dataTransfer == null) {
      return
    }

    if (e.dataTransfer.items) {
      // Prevent default behavior (Prevent file from being opened)
      e.preventDefault()
      e.stopPropagation()
      // Use DataTransferItemList interface to access the file(s)
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        // If dropped items aren't files, reject them
        if (e.dataTransfer.items[i].kind === 'file') {
          const file = e.dataTransfer.items[i].getAsFile()
          if (file == null) {
            continue
          }
          console.log(`... file[${i}].name = ` + file.name)
          this.inpainter.emit('load-file-programmatic')
          await this.inpainter.loadFile(file, this.queryParameters, false)
        }
      }
    } else {
      // Use DataTransfer interface to access the file(s)
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        console.log(`... file[${i}].name = ` + e.dataTransfer.files[i].name)
      }
    }
  }

  toggleScrollLock(axis: 'x' | 'y', force?: boolean): void {
    this.scrollbar?.toggleScrollLock(axis, force)
  }

  protected get totalDurationAt120BPMSeconds() {
    return (
      this.playbackManager.transport.toTicks(
        this.playbackManager.totalDuration
      ) /
      (this.playbackManager.transport.PPQ * 2)
    )
  }

  protected abstract get scalesFontSize(): number

  static readonly commonAxesOptions = {
    grid: {
      drawBorder: false,
      display: false,
    },
  }

  static readonly commonTicksOptions: Partial<TickOptions> = {
    color: 'rgba(255, 255, 255, 0.6)',
    // maxTicksLimit: (ctx) => 30,
    showLabelBackdrop: true,
    backdropColor: 'rgba(0, 0, 0, 0.6)',
    backdropPadding: 2,
  }

  get timeScaleOptions(): Partial<CartesianScaleOptions> {
    return {}
  }

  get ticksOptions(): Partial<TickOptions> {
    return {
      font: (ctx: ScriptableScaleContext) => {
        return {
          family: chartsFontFamily,
          size: this.scalesFontSize,
        }
      },
    }
  }

  protected readonly timeScaleContainer: HTMLDivElement =
    document.createElement('div')
  protected readonly timeScaleCanvas: HTMLCanvasElement =
    document.createElement('canvas')
  protected timeScale?: Chart

  protected drawTimeScale(): Chart {
    if (this.timeScale != null) {
      this.timeScale.destroy()
    }

    const chart = new Chart(this.timeScaleCanvas, {
      type: 'line',
      data: {
        datasets: [],
      },
      options: {
        responsive: true,
        // ensures the canvas fills the entire container
        maintainAspectRatio: false,
        scales: {
          y: {
            display: false,
            ...InpainterGraphicalView.commonAxesOptions,
          },
          x: {
            ...InpainterGraphicalView.commonAxesOptions,

            axis: 'x',
            type: 'linear',
            display: true,

            min: 0, // this.getCurrentScrollPositionTopLayer(),
            max: this.totalDurationAt120BPMSeconds, // this.getCurrentScrollPositionTopLayer() + this.numColumnsTop,

            offset: false,

            ticks: {
              stepSize: 1,
              align: 'start',
              ...InpainterGraphicalView.commonTicksOptions,
              ...this.ticksOptions,
            },
            ...this.timeScaleOptions,
          },
        },
      },
    })
    this.timeScale = chart
    return this.timeScale
  }

  renderZoomControls(containerElement: HTMLElement): void {
    const zoomOutButton = document.createElement('div')
    zoomOutButton.classList.add('zoom-out')
    containerElement.appendChild(zoomOutButton)
    const zoomOutButtonIcon = document.createElement('i')
    zoomOutButtonIcon.classList.add('fa-solid', 'fa-search-minus', 'fa-2x')
    zoomOutButton.appendChild(zoomOutButtonIcon)

    const zoomInButton = document.createElement('div')
    zoomInButton.classList.add('zoom-in')
    containerElement.appendChild(zoomInButton)
    const zoomInButtonIcon = document.createElement('i')
    zoomInButtonIcon.classList.add('fa-solid', 'fa-search-plus', 'fa-2x')
    zoomInButton.appendChild(zoomInButtonIcon)

    zoomOutButton.addEventListener('click', () => this.zoomCallback(false))
    zoomInButton.addEventListener('click', () => this.zoomCallback(true))
  }

  protected abstract zoomCallback(zoomIn: boolean): void

  renderFullscreenControl(containerElement: HTMLElement): void {
    const fullscreenButton = document.createElement('div')
    fullscreenButton.classList.add('fullscreen-toggle')
    containerElement.appendChild(fullscreenButton)
    const fullscreenButtonIcon = document.createElement('i')
    fullscreenButtonIcon.classList.add(
      'fa-solid',
      'fa-2x',
      screenfull.isFullscreen ? 'fa-minimize' : 'fa-maximize'
    )
    fullscreenButton.appendChild(fullscreenButtonIcon)
    const toggleClass = () => {
      fullscreenButtonIcon.classList.remove('fa-minimize', 'fa-maximize')
      fullscreenButtonIcon.classList.add(
        screenfull.isFullscreen ? 'fa-minimize' : 'fa-maximize'
      )
    }

    document.addEventListener('fullscreenchange', (e) => {
      toggleClass()
    })
    document.body.addEventListener('fullscreenerror', (e) => {
      toggleClass()
    })
    fullscreenButton.addEventListener('click', () => {
      if (screenfull.isEnabled) {
        screenfull.toggle(undefined, { navigationUI: 'hide' }).then(toggleClass)
      }
    })
  }
}

// Mixins
type GConstructor<T> = new (...args: any[]) => T
type InterfaceConstructor = GConstructor<{
  readonly container: HTMLElement
}>

export interface ILoadingDisplay {
  readonly displayClasses: string[]
  readonly containerCssClass: string
  readonly cssClass: string
}

// inserts a loading spinner visible when the app is disabled
export function LoadingDisplay<TBase extends InterfaceConstructor>(
  Base: TBase,
  displayClasses = ['fa-solid', 'fa-7x', 'fa-spin', 'fa-cog']
): ILoadingDisplay & TBase {
  return class LoadingDisplay extends Base {
    readonly spinnerContainer: HTMLElement
    readonly spinner: HTMLElement

    static readonly displayClasses = displayClasses
    static readonly containerCssClass = 'loading-spinner-container'
    static readonly cssClass = 'loading-spinner'

    constructor(...args: any[]) {
      super(...args)
      this.spinnerContainer = document.createElement('div')
      this.spinnerContainer.classList.add(
        LoadingDisplay.containerCssClass,
        'fa-solid',
        'fa-7x',
        'fa-cog',
        'centeredXY'
      )
      this.container.appendChild(this.spinnerContainer)
      this.spinner = document.createElement('div')
      this.spinner.classList.add(
        LoadingDisplay.cssClass,
        'fa-solid',
        'fa-cog',
        'fa-spin'
      )
      this.spinnerContainer.appendChild(this.spinner)
    }
  }
}
