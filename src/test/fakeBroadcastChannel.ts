// 테스트용 BroadcastChannel 대체 구현 (jsdom 미지원 보완).
// 같은 채널 이름의 다른 인스턴스들에게 동기적으로 메시지를 전달한다.
export class FakeBroadcastChannel {
  private static registry = new Map<string, Set<FakeBroadcastChannel>>()
  onmessage: ((e: { data: unknown }) => void) | null = null

  constructor(readonly name: string) {
    const set = FakeBroadcastChannel.registry.get(name) ?? new Set()
    set.add(this)
    FakeBroadcastChannel.registry.set(name, set)
  }

  postMessage(data: unknown): void {
    for (const ch of FakeBroadcastChannel.registry.get(this.name) ?? []) {
      if (ch !== this) ch.onmessage?.({ data })
    }
  }

  close(): void {
    FakeBroadcastChannel.registry.get(this.name)?.delete(this)
  }

  static reset(): void {
    FakeBroadcastChannel.registry.clear()
  }
}
