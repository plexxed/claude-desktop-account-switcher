import type { Elements, EngineInterface, RenderInput } from 'claude-code'

import type { Limit, Panel } from '../../types'
import { nameProblem } from '../domain/profileNames'
import { PANEL_IDLE, updatePanel } from '../platform/state'
import { runFromUi, switchAnswer } from './actions'
import type { Action } from './actions'
import { loadAccounts } from './accountsModel'
import type { AccountsModel, Card, Variant } from './accountsModel'
import { keepTree, siteOf } from './drawn'
import { ago, limitView } from './format'
import { cardColumns, rowFits, wordsColumns } from './layout'
import { busyText, deleteNote, lastLine, nameProblemText, switchNote } from './messages'
import { bar, buttons, figure } from './parts'
import { t } from './strings'
import { AVATAR, avatarSvg, box, button, initialOf, texts } from './styles'

// The Accounts list: one card per profile (its avatar, its name, its account's
// email, its limits as bars) with its actions; renaming asks for the name on
// the card; deleting and switching turn the card into the question, framed in
// its tone. The account signed in now comes first: by its profile's name, or as
// "This account" until a profile holds it; the others follow by name. Under the
// cards, adding one, and which accounts share their Code sessions.
//
// Drawn in two steps: what the list shows is loaded into a model of plain data
// (accountsModel.ts), and the model is rendered into the tree (render*: pure;
// draw*: load, render, keep the tree). A model like the last one answers the
// last tree (see drawn.ts).

// --- Rendering -----------------------------------------------------------------------

/** What every part of the list is rendered with, beside the engine. */
type Draw = {
  ui: Elements['desktop']
  text: (typeof texts)['pane']
  /** The time the countdowns and ages are read at. */
  now: number
  model: AccountsModel
}

/** Back to listing, whatever a card was asking. */
function idle($: EngineInterface) {
  return updatePanel($, () => PANEL_IDLE)
}

function renderButtons(d: Draw, actions: Action[]) {
  const { Box } = d.ui

  return <Box {...box.controls}>{buttons(d.ui, actions)}</Box>
}

/**
 * A name field holding `original` (the name being renamed, or nothing) and its
 * Cancel; its own button, `action`, submits as Enter does.
 */
function renderNameField($: EngineInterface, d: Draw, original: string, action: string, onName: (name: string) => void) {
  const { Box, Button, Input } = d.ui

  return (
    <Box {...box.field}>
      <Box {...box.fieldSlot}>
        <Input
          key="name"
          autoFocus
          value={original}
          placeholder={t('name.placeholder')}
          submitLabel={action}
          onSubmit={raw => {
            const name = raw.trim()
            if (name === original) {
              void idle($)
              return
            }
            const problem = nameProblem(name, d.model.taken, original || undefined)
            if (problem) {
              $.ui.toast(nameProblemText(problem, name))
              return
            }
            onName(name)
          }}
        />
      </Box>
      <Button key="cancel" label={t('icon.cancel')} {...button.quiet} onPress={() => void idle($)} />
    </Box>
  )
}

/** One limit: its label, its bar, how much of it is used and when it resets. */
function renderLimitMeter(d: Draw, key: string, limit: Limit) {
  const { Box, Text } = d.ui
  const { label, name, percent, tone, spend, countdown } = limitView(limit, d.now)

  return (
    <Box key={key} {...box.meter}>
      <Text {...d.text.muted}>{label}</Text>
      {percent !== null && bar(d.ui, name, percent, tone)}
      {percent !== null && figure(d.ui, d.text.figure, t('limit.percent', { percent }), tone)}
      {spend && <Text {...d.text.detail}>{spend}</Text>}
      {countdown && <Text {...d.text.detail}>{t('limit.countdown', { countdown })}</Text>}
    </Box>
  )
}

function renderUsage(d: Draw, card: Card) {
  const { Box, Text } = d.ui
  const { usage } = card
  if (usage.kind === 'noSignIn') {
    return <Text {...d.text.muted}>{t('card.noSavedSignIn')}</Text>
  }
  if (usage.kind === 'noWindow' || usage.kind === 'noUsage') {
    return <Text {...d.text.muted}>{t(usage.kind === 'noWindow' ? 'card.noWindow' : 'card.noUsage')}</Text>
  }

  return (
    <Box {...box.usage}>
      <Box {...box.meters}>{usage.limits.map(limit => renderLimitMeter(d, `meter-${card.profile.name}-${limit.kind}`, limit))}</Box>
      {usage.seenAt !== null && <Text {...d.text.muted}>{t('card.updated', { ago: ago(d.now - usage.seenAt) })}</Text>}
    </Box>
  )
}

/** A card's actions, on its name line: none while a command runs. */
function cardActions($: EngineInterface, d: Draw, card: Card): Action[] {
  if (d.model.busy) {
    return []
  }
  const { name } = card.profile
  const ask = (kind: 'switch' | 'delete' | 'rename') => () => updatePanel($, (): Panel => ({ kind, profile: name }))
  const switchAction: Action = {
    key: `switch-${name}`,
    label: t('action.switch'),
    // Leaving an account no profile holds would lose its sign-in.
    onPress: d.model.canSwitch ? ask('switch') : () => $.ui.toast(t('switch.nameFirst', { icon: t('icon.rename') })),
  }
  const rename: Action = { key: `rename-${name}`, label: t('icon.rename'), look: button.quiet, onPress: ask('rename') }
  const remove: Action = { key: `delete-${name}`, label: t('icon.delete'), look: button.quiet, onPress: ask('delete') }

  return card.isCurrent ? [rename] : [switchAction, rename, remove]
}

/**
 * A switch or a delete asks on the card, which goes on saying what it is about;
 * its own actions step aside until it is answered. While the command runs, the
 * card says so in place of its buttons.
 */
function renderCardQuestion($: EngineInterface, d: Draw, card: Card) {
  const { Box, Text } = d.ui
  const { name, hasSignIn } = card.profile
  const isSwitch = card.state === 'switch'
  const question = t(isSwitch ? 'switch.question' : 'delete.question', { name: card.title })
  const note = isSwitch ? switchNote(!hasSignIn) : deleteNote(hasSignIn)
  const answer: Action = isSwitch
    ? switchAnswer($, name)
    : { key: 'confirm', label: t('action.delete'), look: button.primary, onPress: () => runFromUi($, 'delete', [name]) }
  const cancel: Action = { key: 'cancel', label: t('action.cancel'), look: button.secondary, onPress: () => idle($) }

  return (
    <Box {...box.cardBody}>
      <Text {...d.text.strong}>{question}</Text>
      <Text {...d.text.note}>{note}</Text>
      <Box {...box.askControls}>
        {d.model.busy ? <Text {...d.text.muted}>{busyText(d.model.busy)}</Text> : renderButtons(d, [answer, cancel])}
      </Box>
    </Box>
  )
}

/** An account's card: its avatar beside its name line, its email and its limits, or the question it asks. */
function renderCard($: EngineInterface, d: Draw, card: Card) {
  const { Box, Svg, Text } = d.ui
  const { profile, title, isCurrent, isUnnamed } = card
  const isBand = d.model.variant === 'band'
  const isRenaming = card.state === 'rename' && !d.model.busy
  const isAsking = card.state === 'switch' || card.state === 'delete'
  const actions = cardActions($, d, card)

  // The name line: the name and its status, or the rename field; the actions
  // at its end, or under it when the card is too narrow for both.
  const nameLine = wordsColumns(!isBand, isCurrent ? [title, t('card.active')] : [title])
  const labels = actions.map(action => action.label)
  const isStacked = !isRenaming && !rowFits(cardColumns(d.model.columns), [nameLine], labels, !isBand)
  const head = (
    <Box key={`head-${profile.name}`} {...(isStacked ? box.stacked : box.line)}>
      {isRenaming ? (
        isUnnamed ? (
          renderNameField($, d, '', t('action.save'), next => void runFromUi($, 'save', [next]))
        ) : (
          renderNameField($, d, profile.name, t('action.rename'), next => void runFromUi($, 'rename', [profile.name, next]))
        )
      ) : (
        <Box {...box.words}>
          <Text {...d.text.name}>{title}</Text>
          {isCurrent && <Text {...d.text.badge}>{t('card.active')}</Text>}
        </Box>
      )}
      {!isRenaming && actions.length > 0 && renderButtons(d, actions)}
    </Box>
  )

  // While it asks, the card is the question: it names the account, so the
  // name, email and limits step aside, and only the avatar stays.
  const details = isAsking ? (
    renderCardQuestion($, d, card)
  ) : (
    <Box {...box.cardBody}>
      {head}
      {profile.email && <Text {...d.text.detail}>{profile.email}</Text>}
      {renderUsage(d, card)}
    </Box>
  )
  const look = isCurrent ? 'active' : !profile.hasSignIn ? 'pending' : 'idle'
  // A card asking to delete is framed in the error tone; one asking to switch, in the accent.
  const frame = isAsking ? { borderDimColor: false, borderColor: card.state === 'delete' ? 'error' : 'suggestion' } : {}

  return (
    <Box key={`row-${profile.name}`} {...box.card} {...frame}>
      <Svg
        source={avatarSvg(profile.name, initialOf(isUnnamed ? (profile.email ?? '') : profile.name), look)}
        alt={isCurrent ? t('card.avatarActive', { name: title }) : title}
        width={AVATAR}
        height={AVATAR}
      />
      {details}
    </Box>
  )
}

/** Turns `name`'s sharing on or off; done, the script's words say what changes, and from when. */
async function toggleSharing($: EngineInterface, name: string, sharesSessions: boolean) {
  const result = await runFromUi($, 'share', [name, sharesSessions ? 'off' : 'on'])
  const said = result && lastLine(result.said)
  if (said) {
    $.ui.toast(said)
  }
}

/**
 * Sharing is between accounts, so it is said once for all of them: a checkbox
 * per profile, pressed to turn its sharing on or off from the next switch.
 * While a command runs, the boxes only say how each stands.
 */
function renderSharing($: EngineInterface, d: Draw) {
  const { Box, Button, Text } = d.ui

  return (
    <Box {...box.section}>
      <Text {...d.text.heading}>{t('share.heading')}</Text>
      <Text {...d.text.note}>{t('share.note')}</Text>
      <Box {...box.choices}>
        {d.model.sharing.map(({ name, sharesSessions }) => {
          const label = t(sharesSessions ? 'share.ticked' : 'share.unticked', { name })
          if (d.model.busy) {
            return (
              <Text key={`share-${name}`} {...d.text.muted}>
                {label}
              </Text>
            )
          }

          return (
            <Button
              key={`share-${name}`}
              label={label}
              plain
              {...(sharesSessions ? {} : button.quiet)}
              onPress={() => void toggleSharing($, name, sharesSessions)}
            />
          )
        })}
      </Box>
    </Box>
  )
}

function renderAccounts($: EngineInterface, d: Draw, onDone?: () => void) {
  const { Box, Button, Text } = d.ui
  const { model } = d

  return (
    <Box {...box.list}>
      {onDone && (
        <Box {...box.line}>
          <Box {...box.words}>
            <Text {...d.text.heading}>{t('accounts.title')}</Text>
            <Text {...d.text.muted}>{String(model.cards.length)}</Text>
          </Box>
          <Button key="done" label={t('action.done')} {...button.primary} onPress={onDone} />
        </Box>
      )}
      {model.busy && <Text {...d.text.muted}>{busyText(model.busy)}</Text>}
      {!model.isReadable && <Text {...d.text.note}>{t('accounts.unreadable')}</Text>}
      <Box {...box.cards}>{model.cards.map(card => renderCard($, d, card))}</Box>
      {/* Adding only names the account, nothing restarts: it signs in on its first switch. */}
      {!model.busy &&
        (model.isAdding ? (
          renderNameField($, d, '', t('action.add'), name => void runFromUi($, 'add', [name]))
        ) : (
          <Box {...box.line}>
            <Button key="add" label={t('action.addAccount')} onPress={() => void updatePanel($, (): Panel => ({ kind: 'add' }))} />
          </Box>
        ))}
      {model.sharing.length > 0 && renderSharing($, d)}
    </Box>
  )
}

/**
 * Draws the list at the width of `e`'s body. In the band (`variant`), `onDone`
 * draws a header with a Done button that folds the list back; the pane has a
 * title of its own.
 */
export async function drawAccounts(
  $: EngineInterface,
  e: RenderInput<'Pane' | 'AbovePrompt', 'desktop'>,
  variant: Variant,
  onDone?: () => void,
) {
  const columns = e.props.bodyColumns
  const [model, now] = await Promise.all([loadAccounts($, columns, variant), $.clock.now()])
  // Everything the tree is drawn from, the clock to the minute its countdowns and ages read.
  const from = JSON.stringify({ model, minute: Math.floor(now / 60_000) })

  return keepTree(siteOf(e, columns), from, () => renderAccounts($, { ui: $.ui.resolve(e), text: texts[variant], now, model }, onDone))
}
