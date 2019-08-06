import * as Telnet from "..";

/** Example Telnet client. */

function main() {
    const client = Telnet.createConnection(21, "localhost");

    client.on("connect", () => {
        console.log("Connected.");
        client.on("do", (opt) => {
            switch (opt) {
                case Telnet.Options.BINARY_TRANSMISSION:
                    // Ensure response is true here, or else it will wait for the server to call back.
                    client.will(Telnet.Options.BINARY_TRANSMISSION, true);
                    break;
            }
        });
    });

    client.on("error", (err) => {
        console.error(err);
    });

    client.on("close", (hadError) => {
        console.log("Client closed.");
    });
}

main();
