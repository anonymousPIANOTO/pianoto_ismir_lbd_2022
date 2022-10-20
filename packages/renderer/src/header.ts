import '../styles/header.scss'
import {
  setBackgroundColorElectron,
  toggleMaximizeWindowElectron,
} from './utils/display'
import colors from '../styles/mixins/_colors.module.scss'
import { setColors } from './nexusColored'

import localization from '../static/localization.json'

const COMPILE_ELECTRON = import.meta.env.VITE_COMPILE_ELECTRON != undefined

// cf. https://stackoverflow.com/a/53815609/
function restrictCallbackToInitialEventListenerTarget<T extends Event>(
  callback: (event: T) => void
): (event: T) => void {
  return (event: T) => {
    if (event.currentTarget != event.target) {
      return
    } else {
      callback(event)
    }
  }
}

export function render(
  containerElement: HTMLElement,
  configuration: Record<string, unknown>,
  insertSignatureInAppTitle: boolean = false
): void {
  containerElement.addEventListener(
    'dblclick',
    restrictCallbackToInitialEventListenerTarget(toggleMaximizeWindowElectron)
  )
  containerElement.classList.add('application-header')

  const headerCenterElement = document.createElement('div')
  headerCenterElement.addEventListener(
    'dblclick',
    restrictCallbackToInitialEventListenerTarget(toggleMaximizeWindowElectron)
  )
  headerCenterElement.id = 'header-center-element'
  containerElement.appendChild(headerCenterElement)

  const undoButtonContainer = document.createElement('div')
  undoButtonContainer.id = 'undo-button-container'
  undoButtonContainer.classList.add('control-item')
  const undoButtonInterface = document.createElement('i')
  undoButtonInterface.id = 'undo-button'
  undoButtonContainer.appendChild(undoButtonInterface)
  const appTitleGridElement = document.createElement('div')
  appTitleGridElement.id = 'app-title-container'
  const appTitleElement = document.createElement('div')
  appTitleElement.innerText = configuration['app_name'] as string
  appTitleElement.id = 'app-title'
  appTitleGridElement.appendChild(appTitleElement)
  if (false) {
    const signatureElement = document.createElement('div')
    signatureElement.innerHTML = localization['header']['signature']['en']
    signatureElement.classList.add('signature')
    appTitleGridElement.appendChild(signatureElement)
  }

  const redoButtonContainer = document.createElement('div')
  redoButtonContainer.classList.add('control-item')
  redoButtonContainer.id = 'redo-button-container'
  const redoButtonInterface = document.createElement('i')
  redoButtonInterface.id = 'redo-button'
  redoButtonContainer.appendChild(redoButtonInterface)

  headerCenterElement.appendChild(undoButtonContainer)
  headerCenterElement.appendChild(appTitleGridElement)
  headerCenterElement.appendChild(redoButtonContainer)
}

const themes = ['dark']

function cycleThemes(): void {
  const currentTheme = document.body.getAttribute('theme')
  let currentThemeIndex = -1
  if (currentTheme != null && themes.contains(currentTheme)) {
    currentThemeIndex = themes.indexOf(currentTheme)
  }
  const nextTheme = themes[(currentThemeIndex + 1) % themes.length]
  setTheme(nextTheme)
}

const themeToElectronBackgroundColor = new Map([
  ['lavender-light', colors.lavender_dark_mode_panes_background_color],
  ['lavender-dark', colors.lavender_light_mode_panes_background_color],
  ['dark', 'black'],
])

function setTheme(theme: string) {
  document.body.setAttribute('theme', theme)
  if (themeToElectronBackgroundColor.has(theme)) {
    void setBackgroundColorElectron(
      themeToElectronBackgroundColor.get(theme) as string
    )
  }

  if (theme == 'dark') {
    setColors('white', 'black')
  }
}
