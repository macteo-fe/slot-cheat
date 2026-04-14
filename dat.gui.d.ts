declare namespace dat {
    class GUI {
        constructor(params?: any);
        addFolder(name: string): any;
        add(obj: any, prop: string, min?: number, max?: number, step?: number): any;
        addColor(obj: any, prop: string): any;
        destroy(): void;
        hide(): void;
        show(): void;
        domElement: HTMLElement;
    }
}
