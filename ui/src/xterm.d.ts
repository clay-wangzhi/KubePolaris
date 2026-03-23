declare module 'xterm' {
  export class Terminal {
    constructor(options?: Record<string, unknown>);
    open(parent: HTMLElement): void;
    write(data: string | Uint8Array): void;
    writeln(data: string): void;
    clear(): void;
    reset(): void;
    dispose(): void;
    focus(): void;
    blur(): void;
    resize(columns: number, rows: number): void;
    onData(callback: (data: string) => void): { dispose(): void };
    onKey(callback: (event: { key: string; domEvent: KeyboardEvent }) => void): { dispose(): void };
    onResize(callback: (event: { cols: number; rows: number }) => void): { dispose(): void };
    readonly cols: number;
    readonly rows: number;
    readonly element: HTMLElement | undefined;
    options: Record<string, unknown>;
    loadAddon(addon: unknown): void;
    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean): void;
    hasSelection(): boolean;
    getSelection(): string;
    select(column: number, row: number, length: number): void;
    scrollToBottom(): void;
    paste(data: string): void;
  }
}

declare module 'xterm-addon-fit' {
  export class FitAddon {
    constructor();
    fit(): void;
    proposeDimensions(): { cols: number; rows: number } | undefined;
    activate(terminal: unknown): void;
    dispose(): void;
  }
}

declare module 'xterm-addon-web-links' {
  export class WebLinksAddon {
    constructor(handler?: (event: MouseEvent, uri: string) => void, options?: Record<string, unknown>);
    activate(terminal: unknown): void;
    dispose(): void;
  }
}
