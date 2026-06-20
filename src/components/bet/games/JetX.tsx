import type { BetGameProps } from "../../../types";
import { CrashGame } from "./CrashGame";

export const meta = { id: "jetx", defaultLabel: "JetX", defaultIcon: "🚀" };

export default function JetX(props: BetGameProps) {
  return <CrashGame {...props} emoji="🚀" growth={0.6} />;
}
