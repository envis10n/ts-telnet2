import { parseGMCP } from "../gmcp";
import { Util, Options } from "../";

test("util", () => {
    // Fake SB packet with GMCP Core.Hello data.
    const buffer = Util.parseSB(
        Util.writeSB(
            Options.GMCP,
            'Core.Hello {"version":"0.0.1","client":"ts-telnet2"}',
        ),
    ).data;
    const gmcp = parseGMCP(buffer.slice(0, buffer.length - 1));
    expect(gmcp.package).toContain("Core");
    expect(gmcp.package).toContain("Hello");
    expect(gmcp.data.version).toBe("0.0.1");
    expect(gmcp.data.client).toBe("ts-telnet2");
});
