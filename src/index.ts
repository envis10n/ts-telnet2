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

export interface ISBParse {
    option: Options;
    data: Buffer;
}

export namespace Util {
    export function writeIAC(negotiate: Negotiation, option: Options): Buffer {
        return Buffer.from([
            Negotiation.IAC,
            negotiate,
            option,
            ...Buffer.from("\n"),
        ]);
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
            ...Buffer.from("\n"),
        ]);
    }
    export function isEOL(buffer: Buffer): boolean {
        return buffer[buffer.length - 1] === Buffer.from("\n")[0];
    }
    export function stripEOL(buffer: Buffer): Buffer {
        if (buffer[buffer.length - 2] === Buffer.from("\r")[0]) {
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
    export function splitGMCP(buffer: Buffer): Buffer[] {
        const res: Buffer[] = [];
        const packs = buffer
            .toString()
            .split(Buffer.from([Negotiation.IAC, Negotiation.SE]).toString());
        for (const pack of packs) {
            res.push(
                Buffer.from([
                    ...Buffer.from(pack),
                    Negotiation.IAC,
                    Negotiation.SE,
                ]),
            );
        }
        return res;
    }
    export function splitIAC(buffer: Buffer): Buffer[] {
        const res: Buffer[] = [];
        let temp: number = 0;
        for (let i = 0; i < buffer.length; i++) {
            const byte = buffer[i];
            switch (byte) {
                case Negotiation.IAC:
                    if (
                        buffer[i - 1] !== Negotiation.IAC &&
                        buffer[i + 1] !== Negotiation.IAC
                    ) {
                        // Valid IAC, not escaped.
                        if (buffer[i + 1] !== Negotiation.SE) {
                            if (temp !== i) {
                                res.push(buffer.slice(temp, i));
                                temp = i;
                            }
                        }
                    }
                    break;
                case Negotiation.SE:
                    if (buffer[i - 1] === Negotiation.IAC) {
                        // End of subnegotiation.
                        res.push(buffer.slice(temp, i + 1));
                        temp = i + 1;
                    }
                    break;
            }
        }
        return res;
    }
}

export class Server extends EventEmitter {
    private sockets: Map<string, Socket> = new Map();
    constructor(private server: net.Server) {
        super();
        this.server.on("connection", (socket) => {
            let nsock: Socket | null = new Socket(socket);
            this.sockets.set(nsock.uuid, nsock);
            nsock.on("close", (hadError) => {
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
    public close(cb?: (err?: Error) => void): this {
        this.server.close(cb);
        return this;
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

export type Responder = (
    negotiate:
        | Negotiation.DO
        | Negotiation.DONT
        | Negotiation.WILL
        | Negotiation.WONT,
) => void;

export type OptionMatrix<T> = { [key in Options]?: T };

export class Socket extends EventEmitter {
    public readonly uuid: string = v4();
    /**
     * Currently enabled options.
     */
    public options: OptionMatrix<boolean> = {};
    /**
     * Buffer for incoming data.
     *
     * Empties when an EOL is encountered, emitting the "data" event.
     */
    private buffer: number[] = [];
    /**
     * Responder storage object.
     *
     * Contains responder functions for options that have been requested from this side.
     */
    private responders: OptionMatrix<Responder> = {};
    constructor(public readonly socket: net.Socket) {
        super();
        this.socket.on("connect", () => {
            this.emit("connect");
        });
        this.socket.on("end", () => {
            this.emit("end");
        });
        this.socket.on("data", (data) => {
            this.buffer.push(...data);
            if (
                this.buffer[0] === Negotiation.IAC &&
                this.buffer[1] !== Negotiation.IAC
            ) {
                // IAC!
                for (const buffer of Util.splitIAC(Buffer.from(this.buffer))) {
                    this.emit("data", buffer);
                    const responder = this.responders[buffer[2] as Options];
                    switch (buffer[1] as Negotiation) {
                        case Negotiation.DO:
                            if (responder !== undefined) {
                                responder(buffer[1]);
                            }
                            this.emit("do", buffer[2] as Options);
                            break;
                        case Negotiation.DONT:
                            if (responder !== undefined) {
                                responder(buffer[1]);
                            }
                            this.emit("dont", buffer[2] as Options);
                            break;
                        case Negotiation.WILL:
                            if (responder !== undefined) {
                                responder(buffer[1]);
                            }
                            this.emit("will", buffer[2] as Options);
                            break;
                        case Negotiation.WONT:
                            if (responder !== undefined) {
                                responder(buffer[1]);
                            }
                            this.emit("wont", buffer[2] as Options);
                            break;
                        case Negotiation.SB:
                            if (
                                buffer[buffer.length - 2] === Negotiation.IAC &&
                                buffer[buffer.length - 1] === Negotiation.SE
                            ) {
                                // Valid subnegotiation
                                const parse = Util.parseSB(buffer);
                                this.emit(
                                    "subnegotiation",
                                    parse.option,
                                    parse.data,
                                );
                                if (
                                    this.options[Options.GMCP] &&
                                    parse.option === Options.GMCP
                                ) {
                                    try {
                                        const gmcp = parseGMCP(parse.data);
                                        this.emit(
                                            "gmcp",
                                            gmcp.package,
                                            gmcp.data,
                                        );
                                    } catch (e) {
                                        console.log(
                                            "Failed to parse GMCP:",
                                            e.message,
                                        );
                                        console.log(parse.data.toString());
                                    }
                                }
                            }
                            break;
                        default:
                            console.log("Unhandled IAC event:", buffer);
                            break;
                    }
                    this.buffer = [];
                }
            } else if (Util.isEOL(Buffer.from(this.buffer))) {
                const buffer = Util.stripEOL(Buffer.from(this.buffer));
                this.emit("data", buffer);
                this.emit("message", buffer.toString(
                    this.options[Options.BINARY_TRANSMISSION]
                        ? "utf8"
                        : "ascii"
                ));
                this.buffer = [];
            }
        });
    }
    /**
     * Request the other side of the socket to end transmission, allowing a clean disconnect.
     * @param cb Optional callback.
     */
    public end(cb?: () => void): void {
        return this.socket.end(cb);
    }
    /**
     * Write data to the other end of the socket.
     * @param data The data to write to the socket.
     * @param cb Optional callback.
     */
    public write(data: string | Buffer, cb?: (err?: Error) => void): boolean {
        return this.socket.write(data, cb);
    }
    /**
     * Request the client to use an option.
     * @param option The option requested.
     * @param response Whether this is a response. If it is, a responder will not be created.
     * @return A promise that resolves to a boolean, representing whether or not the option was enabled.
     */
    public async do(
        option: Options,
        response: boolean = false,
    ): Promise<boolean> {
        if (!response) {
            const responder = this.setupResponder(Negotiation.DO, option);
            this.write(Util.writeIAC(Negotiation.DO, option));
            return responder;
        } else {
            this.options[option] = true;
            this.write(Util.writeIAC(Negotiation.DO, option));
            return true;
        }
    }
    /**
     * Tell the client to no longer use an option.
     * @param option The option to stop using.
     * @param response Whether this is a response. If it is, a responder will not be created.
     * @return A promise that resolves to a boolean, representing whether or not the option was enabled.
     */
    public async dont(
        option: Options,
        response: boolean = false,
    ): Promise<boolean> {
        if (!response) {
            const responder = this.setupResponder(Negotiation.DONT, option);
            this.write(Util.writeIAC(Negotiation.DONT, option));
            return responder;
        } else {
            this.options[option] = undefined;
            this.write(Util.writeIAC(Negotiation.DONT, option));
            return false;
        }
    }
    /**
     * Express willingness to use an option.
     * @param option The option requested.
     * @param response Whether this is a response. If it is, a responder will not be created.
     * @return A promise that resolves to a boolean, representing whether or not the option was enabled.
     */
    public async will(
        option: Options,
        response: boolean = false,
    ): Promise<boolean> {
        if (!response) {
            const responder = this.setupResponder(Negotiation.WILL, option);
            this.write(Util.writeIAC(Negotiation.WILL, option));
            return responder;
        } else {
            this.options[option] = true;
            this.write(Util.writeIAC(Negotiation.WILL, option));
            return true;
        }
    }
    /**
     * Refuse to use an option.
     * @param option The option to stop using.
     * @param response Whether this is a response. If it is, a responder will not be created.
     * @return A promise that resolves to a boolean, representing whether or not the option was enabled.
     */
    public async wont(
        option: Options,
        response: boolean = false,
    ): Promise<boolean> {
        if (!response) {
            const responder = this.setupResponder(Negotiation.WONT, option);
            this.write(Util.writeIAC(Negotiation.WONT, option));
            return responder;
        } else {
            this.options[option] = undefined;
            this.write(Util.writeIAC(Negotiation.WONT, option));
            return false;
        }
    }
    /**
     * Send a GMCP packet to the client (if enabled).
     * @param packages The package string for this GMCP packet.
     * @param data The object to send.
     */
    public gmcp(packages: string, data: { [key: string]: any }): boolean {
        if (this.options[Options.GMCP]) {
            return this.write(
                Util.writeSB(
                    Options.GMCP,
                    `${packages} ${JSON.stringify(data)}`,
                ),
            );
        } else {
            return false;
        }
    }
    /**
     * Enable GMCP for this client.
     * @return A promise that resolves to a boolean, representing whether or not the option was enabled.
     */
    public async enableGMCP(): Promise<boolean> {
        return this.do(Options.GMCP);
    }
    /**
     * Disable GMCP for this client.
     * @return A promise that resolves to a boolean, representing whether or not the option was enabled.
     */
    public async disableGMCP(): Promise<boolean> {
        return this.dont(Options.GMCP);
    }
    /**
     * Immediately destroy this socket.
     *
     * Don't use this
     * @param error Error to throw. Optional.
     */
    public destroy(error?: Error): void {
        return this.socket.destroy(error);
    }
    /**
     * Enabled or disabled events for specific options when a response is received.
     */
    public emit(event: "enabled" | "disabled", option: Options): boolean;
    /**
     * An event with a message received from the other end.
     */
    public emit(event: "message", data: string): boolean;
    public emit(event: "error", error: Error): boolean;
    /**
     * Raw data from the internal buffer. Stripped of newline and carriage return.
     */
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
    /** An out-of-band subnegotiation. */
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
    public on(event: "message", listener: (message: string) => void): this;
    public on(event: "end" | "connect", listener: () => void): this;
    /**
     * A GMCP packet event.
     */
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
    /**
     * Enabled or disabled events for specific options when a response is received.
     */
    public on(
        event: "enabled" | "disabled",
        listener: (option: Options) => void,
    ): this;
    public on(event: string, listener: EventListener): this {
        return super.on(event, listener);
    }
    /**
     * Sets up a responder function that is called when a response is received from the other end.
     * @param neg Negotiation type.
     * @param option The option being negotiated.
     * @return A promise that resolves to a boolean, representing whether or not the option was enabled.
     */
    private async setupResponder(
        neg: Negotiation,
        option: Options,
    ): Promise<boolean> {
        return new Promise((resolve, reject) => {
            if (this.responders[option] === undefined) {
                this.responders[option] = (n) => {
                    switch (n) {
                        case Negotiation.DO:
                            if (neg === Negotiation.WILL) {
                                this.options[option] = true;
                            }
                            break;
                        case Negotiation.DONT:
                            if (neg === Negotiation.WONT) {
                                this.options[option] = undefined;
                            }
                            break;
                        case Negotiation.WILL:
                            if (neg === Negotiation.DO) {
                                this.options[option] = true;
                            }
                            break;
                        case Negotiation.WONT:
                            if (neg === Negotiation.DONT) {
                                this.options[option] = undefined;
                            }
                            break;
                    }
                    if (this.options[option]) {
                        this.emit("enabled", option);
                    } else {
                        this.emit("disabled", option);
                    }
                    this.responders[option] = undefined;
                    resolve(this.options[option] || false);
                };
            } else {
                reject();
            }
        });
    }
}
/**
 * Create a connection, wrapping a raw TCP socket with a Telnet layer.
 * @param port The port to connect on.
 * @param host The hostname or IP to connect to.
 * @param listener Optional callback.
 */
export function createConnection(
    port: number,
    host: string,
    listener?: () => void,
): Socket {
    return new Socket(net.createConnection(port, host, listener));
}
/**
 * Create a server, wrapping a raw TCP server with a Telnet layer.
 * @param port The port to bind to.
 * @param host The hostname or IP to bind to.
 */
export function createServer(port: number, host: string = "127.0.0.1"): Server {
    const server = net.createServer();
    const nserver = new Server(server);
    server.listen(port, host);
    return nserver;
}
