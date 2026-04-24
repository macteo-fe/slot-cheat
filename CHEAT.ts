import { director, Director, error } from "cc";
import { PREVIEW } from "cc/env";

enum CheatType {
    OneShot = 'OneShot',
    Disable = 'Disable',
    Forever = 'Forever'
}

export class Macteo {
    private _userId: string = "";
    private get userId(): string {
        if (!this._userId) {
            const gameState = this._getGameState();
            if (gameState) {
                this._userId = gameState.networkBridge?.getUserId()
            }
        }

        return this._userId;
    }


    private _gameId = null;
    private get gameId(): string {
        if (!this._gameId) {
            const gameState = this._getGameState();
            this._gameId = gameState.networkBridge?.gameId;
        }

        return this._gameId;
    }

    extraFields: Record<string, string> = {};
    private _cheatTypeCtrl: ReturnType<dat.GUI['add']> = null;

    matrixCols: string[] = [
        '2,4,5,6',
        '3,3,3,3',
        '3,3,3,3',
        '3,3,3,3',
        '3,3,3,3'
    ];
    cheatType: CheatType = CheatType.Disable;

    private readonly _STORAGE_KEY = 'macteo_cheat_9766';

    private _saveToStorage(): void {
        const data = {
            matrixCols: this.matrixCols,
            cheatType: this.cheatType,
            extraFields: this.extraFields,
        };
        localStorage.setItem(this._STORAGE_KEY, JSON.stringify(data));
    }

    private _loadFromStorage(): void {
        const raw = localStorage.getItem(this._STORAGE_KEY);
        if (!raw) {
            return;
        }
        try {
            const data = JSON.parse(raw);
            if (data.matrixCols) {
                this.matrixCols = data.matrixCols;
            }
            if (data.cheatType !== undefined) {
                this.cheatType = data.cheatType;
            }
            if (data.extraFields) {
                this.extraFields = data.extraFields;
            }
        } catch (e) {
            // ignore corrupt data
        }
    }

    setupDatGUI(): void {
        this._loadFromStorage();

        const gui = new dat.GUI();

        gui.domElement.style.zIndex = '1000';
        gui.domElement.style.marginTop = "50";

        const config = { speed: 1 };
        gui.add(config, 'speed', 0.1, 10, 0.1).name('Game Speed').onChange((value: number) => {
            this.setGameSpeed(value);
        });

        let paused = false;
        const actions = {
            pauseResume: () => {
                paused = !paused;
                if (paused) {
                    director.pause();
                } else {
                    director.resume();
                }
                pauseResumeCtrl.name(paused ? 'Resume' : 'Pause');
            },
        };
        const pauseResumeCtrl = gui.add(actions, 'pauseResume').name('Pause');

        const cheatFolder = gui.addFolder('Cheat');
        this._cheatTypeCtrl = cheatFolder.add(this, 'cheatType', [CheatType.Disable, CheatType.OneShot, CheatType.Forever]).name('Cheat Type').onChange(() => this._saveToStorage());
        cheatFolder.add({ clearSession: () => this.clearSession() }, 'clearSession').name('Clear Session');
        cheatFolder.add({
            addField: () => {
                const label = prompt('Field name:');
                if (!label) {
                    return;
                }
                this._addExtraField(cheatFolder, label, '');
            }
        }, 'addField').name('+ Add Field');
        Object.keys(this.extraFields).forEach(label => {
            this._addExtraField(cheatFolder, label, this.extraFields[label]);
        });
        this._setupMatrixGUI(cheatFolder);
    }

    private _addExtraField(folder: dat.GUI, label: string, initialValue: string): void {
        this.extraFields[label] = initialValue;
        const data = { value: initialValue, remove: null };
        const ctrl = folder.add(data, 'value').name(label).onChange((v: string) => {
            this.extraFields[label] = v;
            this._saveToStorage();
        });
        let removeCtrl: ReturnType<dat.GUI['add']>;
        data.remove = () => {
            delete this.extraFields[label];
            this._saveToStorage();
            (folder as any).remove(ctrl);
            (folder as any).remove(removeCtrl);
        };
        removeCtrl = folder.add(data, 'remove').name(`✕ ${label}`);
    }

    private readonly _SPIN_EVENTS = [
        'client-normal-spin-request',
        'client-free-spin-request',
        'client-respin-request',
        'client-normal-game-trial-request',
        'client-free-game-trial-request',
        'client-respin-trial-request',
    ];

    private _getGameState(): any {
        const canvas = (window as any).cc?.find('Canvas');
        const gameDirector = canvas?.getComponentInChildren('Director') ?? canvas?.getComponentInChildren('GameDirector');
        const gameState = gameDirector?.gameStateManager ?? gameDirector?.gameLogic?._gameStateManager?._gameState;
        return gameState;
    }

    interceptClientSendRequest(): boolean{
        this.log('start interceptClientSendRequest')
        const  gameState  = this._getGameState();
        if (!gameState) {
            this.log('gameState not found');
            return false;
        }

        if (!gameState._orgClientSendRequest) {
            gameState._orgClientSendRequest = gameState._clientSendRequest.bind(gameState);
        }

        gameState._clientSendRequest = (...params: any[]) => {
            const data = params[params.length - 1];
            const { event, isCheated } = data;
            const shouldCheat = this.cheatType !== CheatType.Disable && !isCheated && this._SPIN_EVENTS.indexOf(event) !== -1;
            if (shouldCheat) {
                const flat = this.matrixCols.join(',');
                this.log('Intercepted:', event, '— sending cheat:', flat, this.extraFields);
                if (this.cheatType === CheatType.OneShot) {
                    this.cheatType = CheatType.Disable;
                    this._saveToStorage();
                    this._cheatTypeCtrl?.updateDisplay();
                }
                this.sendCheat({ matrixData: flat, ...this.extraFields }).then(() => {
                    data.isCheated = true;
                    gameState._orgClientSendRequest(...params);
                }).catch(() => {
                    gameState._orgClientSendRequest(...params);
                });
            } else {
                gameState._orgClientSendRequest(...params);
            }
        };

        this.log('_clientSendRequest intercepted');
        return true;
    }

    private _setupMatrixGUI(parent: dat.GUI): void {
        const COLS = 5;
        const matrixData: Record<string, string> = {};
        for (let col = 0; col < COLS; col++) {
            matrixData[`col${col}`] = this.matrixCols[col];
        }

        const matrixFolder = parent.addFolder('Matrix');
        for (let col = 0; col < COLS; col++) {
            matrixFolder.add(matrixData, `col${col}`).name(`Col ${col}`).onChange((value: string) => {
                this.matrixCols[col] = value;
                this._saveToStorage();
            });
        }
    }

    async clearSession(): Promise<void> {
        const url = `https://cheat.staging.enostd.gay/${this.gameId}/clearsession`;
        const data = {
            userId: this.userId,
            currency: "USD",
        };
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(data).toString(),
        }).then(() => {
            this.log('Clear session sent');
        }).catch((e) => {
            error(e);
        });
    }

    async sendCheat(data): Promise<void> {
        return new Promise<any>((resolve, reject) => {

            const serviceId = this.gameId;
            const cheatURL = `https://cheat.staging.enostd.gay/${serviceId}/inputed`;

            const dataParams = new URLSearchParams(data);

            const url = `${cheatURL}?userId=${this.userId}&serviceId=${serviceId}&${dataParams.toString()}`;

            fetch(url, {
                method: "POST",
            }).then(
                (response) => {
                    this.log("CHEAT RESPONSE ", response)
                    resolve(response);
                }
            ).catch((e) => {
                error(e);
                reject();
            });
        })
    }

    async addMoney(): Promise<any> {
        const api = `https://api.staging.enostd.gay/internal-support-tool/wallet/deposit/${this.userId}`;

        const data = {
            "clientType": "client1",
            "server": "STAGING",
            "value": 1,
            "walletType": 0
        }

        return new Promise<any>((resolve, reject) => {
            fetch(api, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            }).then(
                (response) => {
                    this.log("CHEAT RESPONSE ", response)
                    resolve(response);
                }
            ).catch((e) => {
                error(e);
                reject();
            });
        });
    }

    log(...args: any[]): void {
        console.log('%cMACTEO', 'color: white; background: rgba(100,100,255,125); padding: 2px 4px;', ...args);
    }

    trace(...args: any[]): void {
        console.groupCollapsed('%cMACTEO', 'color: white; background: rgba(100,100,255,125); padding: 2px 4px;', ...args);
        console.trace();
        console.groupEnd();
    }

    watchProperty(obj: any, prop: string, onSet?: (value) => void): void {
        let value = obj[prop];

        Object.defineProperty(obj, prop, {
            get() {
                return value;
            },
            set(newVal) {
                this.log(obj, `Property "${prop}" changed:`, value, '→', newVal);
                onSet?.(newVal);
                value = newVal;
            },
            configurable: true,
        });
    }

    watchPropertyOneShot(obj: any, prop: string, onSet?: (value) => void): void {
        let value = obj[prop];

        Object.defineProperty(obj, prop, {
            get() {
                return value;
            },
            set(newVal) {
                this.log(`Property "${prop}" changed:`, value, '→', newVal);
                Object.defineProperty(obj, prop, { value: newVal, writable: true, configurable: true });
                onSet?.(newVal);
                value = newVal;
            },
            configurable: true,
        });
    }

    setGameSpeed(speed: number): void {
        const originalTick = (director as any)._originalTick ?? (director as any).tick?.bind(director);
        // eslint-disable-next-line curly
        if (!originalTick) return;

        if (!(director as any)._originalTick) {
            (director as any)._originalTick = originalTick;
        }

        (director as any).tick = (dt: number, ...args: any[]) => {
            originalTick(dt * speed, ...args);
        };
    }
}

const macteo = new Macteo();
window['macteo'] = macteo;

director.once(Director.EVENT_AFTER_SCENE_LAUNCH, () => {
    if (!PREVIEW) {
        return;
    }
    macteo.setupDatGUI();
    tryIntercept();
});

const step = 1;
async function tryIntercept(): Promise<void>{
    let isIntercepted = false;
    while(isIntercepted == false) {
        isIntercepted = macteo.interceptClientSendRequest();
        await delay(step);
    }
}

async function delay(duration): Promise<void> {
    return new Promise<void>(resolve => {
        setInterval(() => {
            resolve();
        }, duration * 1000);
    })
}


export default macteo;

