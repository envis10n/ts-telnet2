import { Server, Socket, createServer, createConnection, Options } from "../";

test("net", async () => {
    await new Promise((resolve, reject) => {
        let server: Server | null = createServer(3355);
        server.on("listening", () => {
            console.log("Listening...");
        });
        server.on("connection", (socket) => {
            console.log("Socket", socket.uuid, "connected.");
            socket.on("end", () => {
                if (server !== null) {
                    server.close();
                    server = null;
                }
                resolve();
            });
            socket.on("gmcp", (packages, obj) => {
                const pack = packages.join(".");
                console.log("GMCP received");
                if (pack === "Core.Hello") {
                    console.log("Core Hello from client:", obj);
                    socket.end();
                }
            });
            socket.on("error", (err) => {
                throw err;
            });
            socket.on("do", (option) => {
                if (option === Options.GMCP) {
                    socket.canGMCP = true;
                    socket.will(Options.GMCP);
                }
            });
        });
        let client: Socket | null = createConnection(3355, "127.0.0.1");
        client.on("connect", () => {
            if (client !== null) {
                console.log("Client connect");
                client.enableGMCP();
            }
        });
        client.on("will", (option) => {
            if (client !== null) {
                if (option === Options.GMCP) {
                    client.canGMCP = true;
                    client.gmcp("Core.Hello", {
                        version: "0.0.1",
                        client: "ts-telnet2",
                    });
                }
            }
        });
        client.on("end", () => {
            console.log("Client end");
            if (client !== null) {
                client = null;
            }
        });
    });
});
