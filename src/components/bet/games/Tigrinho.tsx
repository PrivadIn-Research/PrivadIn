import type { BetGameProps } from "../../../types";
import { SlotMachine, type SlotSymbol } from "./SlotMachine";

const SYMBOLS: SlotSymbol[] = [
  { id: "tiger", icon: "🐯", mult: 50, weight: 3, wild: true },
  { id: "bag", icon: "💰", mult: 20, weight: 6 },
  { id: "env", icon: "🧧", mult: 12, weight: 9 },
  { id: "ingot", icon: "🪙", mult: 8, weight: 13 },
  { id: "lantern", icon: "🏮", mult: 5, weight: 17 },
  { id: "orange", icon: "🍊", mult: 3, weight: 24 },
];

export const meta = { id: "tigrinho", defaultLabel: "Tigrinho da Sorte", defaultIcon: "🐯" };

export default function Tigrinho(props: BetGameProps) {
  return <SlotMachine {...props} symbols={SYMBOLS} />;
}
