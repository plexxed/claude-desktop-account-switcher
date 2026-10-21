import type { Elements, TextProps } from 'claude-code'

import type { Level } from '../domain/levels'
import type { Action } from './actions'
import { t } from './strings'
import { BAR, alert, barSvg } from './styles'

// The pieces the band and the Accounts list both draw: a figure, and buttons.

type Desktop = Elements['desktop']

/** A figure's bar, filled to `percent` in its tone; its text alternative names the figure: "5-hour limit: 23% used". */
export function bar({ Svg }: Pick<Desktop, 'Svg'>, name: string, percent: number, tone: Level) {
  const figures = t('limit.percentUsed', { percent: Math.round(percent) })

  return <Svg source={barSvg(percent, tone)} alt={t('limit.named', { name, figures })} width={BAR.width} height={BAR.height} />
}

/** A figure's value, set as a figure (`style`), neutral until it needs attention. */
export function figure({ Text }: Pick<Desktop, 'Text'>, style: TextProps, value: string, tone: Level) {
  return (
    <Text {...style} {...alert(tone)}>
      {value}
    </Text>
  )
}

/**
 * `actions` as the app's buttons, side by side in the row they are put in: an
 * array of keyed elements, as a fragment (<>) would be a column Box of its own.
 */
export function buttons({ Button }: Pick<Desktop, 'Button'>, actions: Action[]) {
  return actions.map(action => <Button key={action.key} label={action.label} {...action.look} onPress={action.onPress} />)
}
