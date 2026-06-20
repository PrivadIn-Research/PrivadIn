import type { ComponentType } from "react";
import type { BetGameProps } from "../../types";
import Tigrinho from "./games/Tigrinho";
import FortuneOx from "./games/FortuneOx";
import Spaceman from "./games/Spaceman";
import JetX from "./games/JetX";
import Mines from "./games/Mines";
import Plinko from "./games/Plinko";
import Blackjack from "./games/Blackjack";

/**
 * Jogos portados de assets/joguinhos_para_adicionar/*.html.
 * O lobby so mostra jogos habilitados QUE tenham um componente registrado aqui.
 * (Nao ha asset de "aviator"; mines_aviator.html foi portado como Mines.)
 */
export const BET_GAME_COMPONENTS: Record<string, ComponentType<BetGameProps>> = {
  tigrinho: Tigrinho,
  fortune_ox: FortuneOx,
  spaceman: Spaceman,
  jetx: JetX,
  mines: Mines,
  plinko: Plinko,
  blackjack: Blackjack,
};

export function hasGameComponent(gameId: string) {
  return Boolean(BET_GAME_COMPONENTS[gameId]);
}
