import { EventEmitter } from "events";
import * as net from "net";
import { v4 } from "uuid";
import { parseGMCP } from "./gmcp";

export enum Negotiation {
    /** Mark the start of a negotiation sequence. */
    IAC = 255,
    /** Confirm  */
    WILL = 251,
    /** Tell the other side that we refuse to use an option. */
    WONT = 252,
    /** Request that the other side begin using an option. */
    DO = 253,
    /**  */
    DONT = 254,
    NOP = 241,
    SB = 250,
    SE = 240,
    IS = 0,
    SEND = 1,
}

type EventListener = (...args: any) => void;

export enum Options {
    /** Whether the other side should interpret data as 8-bit characters instead of standard NVT ASCII.  */
    BINARY_TRANSMISSION = 0,
    /** Whether the other side should continue to echo characters. */
    ECHO = 1,
    RECONNECTION = 2,
    SUPPRESS_GO_AHEAD = 3,
    APPROX_MESSAGE_SIZE_NEGOTIATION = 4,
    STATUS = 5,
    TIMING_MARK = 6,
    REMOTE_CONTROLLED_TRANS_ECHO = 7,
    OUTPUT_LINE_WIDTH = 8,
    OUTPUT_PAGE_SIZE = 9,
    OUTPUT_CR_DISPOSITION = 10,
    OUTPUT_HORIZONTAL_TAB_STOPS = 11,
    OUTPUT_HORIZONTAL_TAB_DISPOSITION = 12,
    OUTPUT_FORMFEED_DISPOSITION = 13,
    OUTPUT_VERTICAL_TAB_STOPS = 14,
    OUTPUT_VERTICAL_TAB_DISPOSITION = 15,
    OUTPUT_LINEFEED_DISPOSITION = 16,
    EXTENDED_ASCII = 17,
    LOGOUT = 18,
    BYTE_MACRO = 19,
    DATA_ENTRY_TERMINAL = 20,
    SUPDUP = 21,
    SUPDUP_OUTPUT = 22,
    SEND_LOCATION = 23,
    TERMINAL_TYPE = 24,
    END_OF_RECORD = 25,
    TACACS_USER_IDENTIFICATION = 26,
    OUTPUT_MARKING = 27,
    TERMINAL_LOCATION_NUMBER = 28,
    TELNET_3270_REGIME = 29,
    X3_PAD = 30,
    /**
     * Whether to negotiate about window size (client).
     * @example
     * [IAC, SB, NAWS, WIDTH[1], WIDTH[0], HEIGHT[1], HEIGHT[0], IAC, SE]
     */
    NEGOTIATE_ABOUT_WINDOW_SIZE = 31,
    TERMINAL_SPEED = 32,
    REMOTE_FLOW_CONTROL = 33,
    LINEMODE = 34,
    X_DISPLAY_LOCATION = 35,
    ENVIRONMENT = 36,
    AUTHENTICATION = 37,
    ENCRYPTION = 38,
    NEW_ENVIRONMENT = 39,
    TN3270E = 40,
    XAUTH = 41,
    CHARSET = 42,
    TELNET_REMOTE_SERIAL_PORT = 43,
    COM_PORT_CONTROL = 44,
    TELNET_SUPPRESS_LOCAL_ECHO = 45,
    TELNET_START_TLS = 46,
    KERMIT = 47,
    SEND_URL = 48,
    FORWARD_X = 49,
    TELOPT_PRAGMA_LOGON = 138,
    TELOPT_SSPI_LOGON = 139,
    TELOPT_PRAGMA_HEARTBEAT = 140,
    /** Generic MUD Communication Protocol option.
     * @example
     * [IAC, SB, GMCP, "Package.SubPackage", "JSON", IAC, SE]
     */
    GMCP = 201,
    EXTENDED_OPTIONS_LIST = 255,
}

interface ISBParse {
    option: Options;
    data: Buffer;
}

export namespace Util {
    export function writeIAC(negotiate: Negotiation, option: Options): Buffer {
        return Buffer.from([Negotiation.IAC, negotiate, option]);
    }
    export function writeSB(option: Options, data: string): Buffer {
        const d = Buffer.from(data);
        const fin: number[] = [];
        // Double byte values of 0xFF (255) as per spec.
        for (const byte of d) {
            if (byte === 255) {
                fin.push(byte, byte);
            } else {
                fin.push(byte);
            }
        }
        return Buffer.from([
            Negotiation.IAC,
            Negotiation.SB,
            option,
            ...Buffer.from(fin),
            Negotiation.IAC,
            Negotiation.SE,
        ]);
    }
    export function isEOL(buffer: Buffer): boolean {
        return buffer[buffer.length - 1] === "\n".codePointAt(0);
    }
    export function stripEOL(buffer: Buffer): Buffer {
        if (buffer[buffer.length - 2] === "\r".codePointAt(0)) {
            return buffer.slice(0, buffer.length - 2);
        } else {
            return buffer.slice(0, buffer.length - 1);
        }
    }
    export function parseSB(buffer: Buffer): ISBParse {
        const option = buffer[2] as Options;
        const data = buffer.slice(3, buffer.length - 2);
        return {
            option,
            data,
        };
    }
}

export class Server extends EventEmitter {
    private sockets: Map<string, Socket> = new Map();
    constructor(private server: net.Server) {
        super();
        this.server.on("connection", (socket) => {
            let nsock: Socket | null = new Socket(socket);
            this.sockets.set(nsock.uuid, nsock);
            socket.on("close", (hadError) => {
                if (nsock !== null) {
                    this.sockets.delete(nsock.uuid);
                    nsock = null;
                }
            });
            this.emit("connection", nsock);
        });
        this.server.on("listening", () => {
            this.emit("listening");
        });
        this.server.on("error", (err) => {
            this.emit("error", err);
        });
    }
    public emit(event: "listening"): boolean;
    public emit(event: "error", error: Error): boolean;
    public emit(event: "connection", socket: Socket): boolean;
    public emit(event: string, ...args: any): boolean {
        return super.emit(event, ...args);
    }
    public on(event: "listening", listener: () => void): this;
    public on(event: "connection", listener: (socket: Socket) => void): this;
    public on(event: "error", listener: (error: Error) => void): this;
    public on(event: string, listener: EventListener): this {
        return super.on(event, listener);
    }
    public getSocket(uuid: string): Socket | undefined {
        return this.sockets.get(uuid);
    }
}
export class Socket extends EventEmitter {
    public readonly uuid: string = v4();
    public canGMCP: boolean = false;
    private buffer: number[] = [];
    constructor(private readonly socket: net.Socket) {
        super();
        this.socket.on("connect", () => {
            this.emit("connect");
        });
        this.socket.on("data", (data) => {
            this.buffer.push(...data);
            if (
                this.buffer[0] === Negotiation.IAC &&
                Util.isEOL(Buffer.from(this.buffer))
            ) {
                const buffer = Util.stripEOL(Buffer.from(this.buffer));
                switch (buffer[1] as Negotiation) {
                    case Negotiation.DO:
                        this.emit("do", buffer[2] as Options);
                        break;
                    case Negotiation.DONT:
                        this.emit("dont", buffer[2] as Options);
                        break;
                    case Negotiation.WILL:
                        this.emit("will", buffer[2] as Options);
                        break;
                    case Negotiation.WONT:
                        this.emit("wont", buffer[2] as Options);
                        break;
                    case Negotiation.SB:
                        if (
                            buffer[1] === Negotiation.SB &&
                            buffer.slice(buffer.length - 2) ===
                                Buffer.from([Negotiation.IAC, Negotiation.SE])
                        ) {
                            // Valid subnegotiation
                            const parse = Util.parseSB(buffer);
                            this.emit(
                                "subnegotiation",
                                parse.option,
                                parse.data,
                            );
                            if (this.canGMCP && parse.option === Options.GMCP) {
                                try {
                                    const gmcp = parseGMCP(parse.data);
                                    this.emit("gmcp", gmcp.package, gmcp.data);
                                } catch (e) {
                                    this.emit(
                                        "error",
                                        new Error(
                                            "Failed to parse GMCP packet: " +
                                                e.message,
                                        ),
                                    );
                                }
                            }
                        }
                        break;
                }
                this.buffer = [];
            }
        });
    }
    public emit(event: "error", error: Error): boolean;
    public emit(event: "data", chunk: Buffer): boolean;
    public emit(event: "close", hadError: boolean): boolean;
    public emit(event: "end" | "connect"): boolean;
    public emit(
        event: "gmcp",
        packages: string[],
        obj: { [key: string]: any },
    ): boolean;
    public emit(
        event: "will" | "wont" | "do" | "dont",
        option: Options,
    ): boolean;
    public emit(
        event: "subnegotiation",
        option: Options,
        data: Buffer,
    ): boolean;
    public emit(event: string, ...args: any): boolean {
        return super.emit(event, ...args);
    }
    public on(event: "error", listener: (error: Error) => void): this;
    public on(event: "data", listener: (chunk: Buffer) => void): this;
    public on(event: "close", listener: (hadError: boolean) => void): this;
    public on(event: "end" | "connect", listener: () => void): this;
    public on(
        event: "gmcp",
        listener: (packages: string[], obj: { [key: string]: any }) => void,
    ): this;
    public on(
        event: "will" | "wont" | "do" | "dont",
        listener: (option: Options) => void,
    ): this;
    public on(
        event: "subnegotiation",
        listener: (option: Options, data: Buffer) => void,
    ): this;
    public on(event: string, listener: EventListener): this {
        return super.on(event, listener);
    }
}
export function createConnection(
    port: number,
    host: string,
    listener?: () => void,
): Socket {
    return new Socket(net.createConnection(port, host, listener));
}
export function createServer(port: number, host: string = "127.0.0.1"): Server {
    const server = net.createServer();
    const nserver = new Server(server);
    server.listen(port, host);
    return nserver;
}
