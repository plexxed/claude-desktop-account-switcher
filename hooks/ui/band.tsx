import type { Elements, EngineInterface } from 'claude-code'

import type { Mode } from '../../types'
import type { Profile } from '../domain/profiles'
import { bestEffort } from '../platform/log'
import { MODE_IDLE, PANEL_IDLE, readBusy, readMode, updateMode, updatePanel } from '../platform/state'
import { readProfiles } from '../services/readModel'
import { drawAccounts } from './accounts'
import { openAccounts, switchAnswer } from './actions'
import type { Action } from './actions'
import { loadFigures, loadQuestion } from './bandModel'
import type { BandInput, FiguresModel, Metric, QuestionModel } from './bandModel'
import { keepTree, siteOf } from './drawn'
import { MANAGE, UNNAMED } from './ids'
import type { Layout } from './layout'
import { hintColumns, textColumns } from './layout'
import { busyText, switchNote } from './messages'
import { bar, buttons, figure } from './parts'
import { around, t } from './strings'
import { box, button, texts } from './styles'

// The band above the prompt: the context and the plan's limits, and the
// account picker; it also unfolds the Accounts list in place. Like the list,
// it is drawn in two steps: a model of plain data is loaded (bandModel.ts),
// then rendered into the tree (render*: pure; draw*: load, render, keep the tree).

type Desktop = Elements['desktop']

const text = texts.band

// --- The picker ---------------------------------------------------------------------

/**
 * The list opens in the side pane, where it has the room of a column of cards.
 * Should no surface place the pane, it unfolds in the band instead, and scrolls there.
 */
async function manageAccounts($: EngineInterface) {
  const opened = await bestEffort($, 'opening the Accounts pane', openAccounts($))
  if (!opened?.isPlaced) {
    await updateMode($, (): Mode => ({ kind: 'manage' }))
  }
}

// The desktop keeps the person's pick in the picker until the band draws a new
// tree, and a pick that switches nothing leaves the band as it was. So such a
// pick counts here, the count keys the picker's seat, and the redraw puts back
// a picker showing the account signed in now.
let picksKept = 0

function resetPicker($: EngineInterface) {
  picksKept += 1
  $.ui.invalidate('ui.render')
}

/** A pick of the picker, which shows `current` (the signed-in profile's name, null while none holds it). */
async function choose($: EngineInterface, current: string | null, value: string) {
  const isSwitch = current !== null && value !== MANAGE && value !== current
  if (isSwitch && !(await readBusy($))) {
    return updateMode($, (): Mode => ({ kind: 'confirm', target: value }))
  }
  resetPicker($)
  // Leaving an account no profile holds would lose its sign-in: show the list, where it gets one.
  if (value === MANAGE || (!current && value !== UNNAMED)) {
    await manageAccounts($)
  }
}

// --- The question ---------------------------------------------------------------------

/**
 * A question reads as one sentence on the left, its buttons on the right, or
 * what runs while it runs. It reads the same at any width, so one tree answers
 * every width the desktop draws it at, and its buttons keep their press handles
 * (see drawn.ts).
 */
function renderSwitchQuestion($: EngineInterface, ui: Desktop, model: QuestionModel) {
  const { Box, Text } = ui
  const [before, after] = around('switch.question', 'name')
  const answer = switchAnswer($, model.target)
  const cancel: Action = { key: 'cancel', label: t('icon.cancel'), look: button.quiet, onPress: () => void updateMode($, () => MODE_IDLE) }

  return (
    <Box {...box.line}>
      <Text {...text.body}>
        {before}
        <Text {...text.strong}>{model.target}</Text>
        {after} <Text {...text.muted}>{switchNote(!model.hasSignIn)}</Text>
      </Text>
      <Box {...box.controls}>{model.busy ? <Text {...text.muted}>{busyText(model.busy)}</Text> : buttons(ui, [answer, cancel])}</Box>
    </Box>
  )
}

async function drawSwitchQuestion($: EngineInterface, e: BandInput, target: Profile) {
  const model = await loadQuestion($, target)

  // The same at every width: its site leaves the width out.
  return keepTree(siteOf(e, 'confirm'), JSON.stringify(model), () => renderSwitchQuestion($, $.ui.resolve(e), model))
}

// --- The figures line ---------------------------------------------------------------

/**
 * A figure: its label, bar, value and countdown, as far as `layout` keeps them.
 * Hovering anywhere on it reveals its hint card above it, one short line per
 * fact so the card never folds a line of its own. The value sits in a slot as
 * wide as its widest, so the bars hold still; the countdown takes its own width
 * (the layout and the picker reckon with its widest all the same).
 */
function renderMetric(ui: Desktop, layout: Layout, metric: Metric) {
  const { Box, Text } = ui

  return (
    <Box key={metric.key} {...box.metric}>
      {/* Its lines and two border rows above the figure. */}
      <Box {...box.hint} top={-(metric.hint.length + 2)} minWidth={hintColumns(metric.hint)}>
        {metric.hint.map((line, i) => (
          <Text key={`hint-${i}`} {...text.body}>
            {line}
          </Text>
        ))}
      </Box>
      {metric.label && <Text {...text.muted}>{metric.label}</Text>}
      {layout.hasBars && metric.percent !== null && bar(ui, metric.name, metric.percent, metric.tone)}
      <Box {...box.valueSlot} minWidth={Math.ceil(textColumns('figure', metric.widestValue))}>
        {figure(ui, text.figure, metric.value, metric.tone)}
      </Box>
      {layout.hasResets && metric.countdown && <Text {...text.detail}>{metric.countdown}</Text>}
    </Box>
  )
}

function renderFigures($: EngineInterface, ui: Desktop, model: FiguresModel) {
  const { Box, Select } = ui

  return (
    <Box {...box.line}>
      <Box {...(model.layout.isWide ? box.metrics : box.metricsTight)}>
        {model.metrics.map(metric => renderMetric(ui, model.layout, metric))}
      </Box>
      <Box key={`picker-${model.picksKept}`} {...box.picker}>
        <Select
          key="account"
          value={model.current ?? UNNAMED}
          options={model.options}
          onSelect={value => void choose($, model.current, value)}
        />
      </Box>
    </Box>
  )
}

async function drawFigures($: EngineInterface, e: BandInput, list: Profile[], current: Profile | null) {
  const model = await loadFigures($, e, list, current, picksKept)

  // Everything the line shows; its countdowns and hints read to the minute, so a
  // new minute is a new model. A redraw with nothing new answers the same tree.
  return keepTree(siteOf(e, 'figures', e.props.bodyColumns), JSON.stringify(model), () => renderFigures($, $.ui.resolve(e), model))
}

/** Folds the list unfolded in the band back into the figures line. */
async function foldAccounts($: EngineInterface) {
  await updatePanel($, () => PANEL_IDLE)
  await updateMode($, () => MODE_IDLE)
}

export async function drawBand($: EngineInterface, e: BandInput) {
  const state = await readMode($)
  if (state.kind === 'manage') {
    return drawAccounts($, e, 'band', () => void foldAccounts($))
  }
  const { list, current } = await readProfiles($)
  if (state.kind !== 'confirm') {
    return drawFigures($, e, list, current)
  }
  // A question about a profile gone meanwhile (deleted or renamed elsewhere)
  // has nothing left to ask: the figures stand in for it, until the next pick
  // or command sets the band anew (a drawing writes no state).
  const target = list.find(one => one.name === state.target)

  return target ? drawSwitchQuestion($, e, target) : drawFigures($, e, list, current)
}
