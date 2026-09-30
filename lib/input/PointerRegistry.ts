export interface PointerIdentity {
  pointerId: number;
}

export class PointerRegistry<State extends PointerIdentity> {
  private readonly entries = new Map<number, State>();

  get size(): number {
    return this.entries.size;
  }

  get(pointerId: number): State | undefined {
    return this.entries.get(pointerId);
  }

  set(state: State): void {
    this.entries.set(state.pointerId, state);
  }

  delete(pointerId: number): boolean {
    return this.entries.delete(pointerId);
  }

  values(): IterableIterator<State> {
    return this.entries.values();
  }

  clear(): void {
    this.entries.clear();
  }
}
