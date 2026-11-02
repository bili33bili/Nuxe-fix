import { useSyncExternalStore } from "react";
import { engine } from "@/engine/projectEngine";

export function useEngine() {
  useSyncExternalStore(
    engine.subscribe,
    engine.getVersion,
    () => 0,
  );
  return engine;
}
