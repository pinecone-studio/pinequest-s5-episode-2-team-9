import { keys, type ModelDefinition, type PieceDef } from '../models/ModelDefinition'

/** A piece's name, numbered for copies of one structure (Lobule 7, Ring 3). */
export function pieceLabel(tx: (key: string) => string, def: ModelDefinition, piece: PieceDef): string {
  const name = tx(keys.pieceName(def.id, piece))
  return piece.n ? `${name} ${piece.n}` : name
}
