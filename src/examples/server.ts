import * as Telnet from "..";

/** Example Telnet server. */

function main() {
    const server = Telnet.createServer(21);
    server.on("listening", () => console.log("Server listening..."));
    server.on("connection", (socket) => {
        console.log("Socket", socket.uuid, "connected.");

        // Enable binary transmission and NAWS.
        socket.do(Telnet.Options.BINARY_TRANSMISSION).then((enabled) => {
            if (enabled) {
                // Binary Transmission is active.
                console.log("Now using Binary Transmission with", socket.uuid);
            } else {
                console.log("Client denies using Binary Transmission.");
            }
        });
        socket
            .do(Telnet.Options.NEGOTIATE_ABOUT_WINDOW_SIZE)
            .then((enabled) => {
                if (enabled) {
                    // NAWS is active
                    console.log(
                        "Now getting information about window size from",
                        socket.uuid,
                    );
                    socket.on("subnegotiation", (opt, data) => {
                        if (
                            opt === Telnet.Options.NEGOTIATE_ABOUT_WINDOW_SIZE
                        ) {
                            // Inspect window data here.
                            console.log(
                                "Received window size from client",
                                socket.uuid,
                            );
                            console.log(data);
                        }
                    });
                } else {
                    console.log("Client denies using NAWS.");
                }
            });
    });
}

main();
