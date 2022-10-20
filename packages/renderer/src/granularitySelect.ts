import * as ControlLabels from './controlLabels'
import {
  createIconElements,
  CycleSelectView,
  VariableValue,
} from './cycleSelect'

import quarterNoteIconUrl from '../static/icons/quarter-note.svg'
import halfNoteIconUrl from '../static/icons/half-note.svg'
import wholeNoteIconUrl from '../static/icons/whole.svg'

const availableGranularityIcons = new Map([
  [1, quarterNoteIconUrl],
  [2, halfNoteIconUrl],
  [4, wholeNoteIconUrl],
  // [8, 'whole-two.png'],
  // [12, 'whole-three.png'],
  // [16, 'whole-four.png'],
])

function makeGranularityIconsList(
  granularities_quarters: number[]
): Map<number, string> {
  const granularitiesIcons = new Map<number, string>()
  const sortedGranularities = granularities_quarters.sort()

  for (
    let granularity_index = 0, num_granularities = sortedGranularities.length;
    granularity_index < num_granularities;
    granularity_index++
  ) {
    const granularity = sortedGranularities[granularity_index]
    const iconName = availableGranularityIcons.has(granularity)
      ? availableGranularityIcons.get(granularity)
      : // TODO create better icon for unusual duration or simply use HTMLContent in button?
        'whole.svg'

    granularitiesIcons.set(granularity, iconName)
  }

  return granularitiesIcons
}

// Time-granularity selector
// TODO(@REDACTED, 2022/02/25): turn into class similar to './instruments.ts'
export function renderGranularitySelect(
  containerElement: HTMLElement,
  granularitiesQuarters: number[]
): [VariableValue<number>, CycleSelectView<number>] {
  const granularityIcons = makeGranularityIconsList(granularitiesQuarters)

  const granularitySelectContainerElement = document.createElement('div')
  granularitySelectContainerElement.classList.add('control-item')
  granularitySelectContainerElement.id = 'granularity-select-container'
  containerElement.appendChild(granularitySelectContainerElement)

  const granularitySelect = new VariableValue<number>(granularitiesQuarters)
  granularitySelect.value = granularitiesQuarters[0]

  const iconElements = createIconElements<number>('file::', granularityIcons)
  const granularitySelectView = new CycleSelectView(
    granularitySelect,
    iconElements
  )
  granularitySelectContainerElement.appendChild(granularitySelectView)

  ControlLabels.createLabel(
    granularitySelectContainerElement,
    'granularity-select-label',
    false,
    undefined,
    containerElement
  )
  return [granularitySelect, granularitySelectView]
}
