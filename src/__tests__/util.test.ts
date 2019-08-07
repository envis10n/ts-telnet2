import { Util, Negotiation, Options } from "..";

test("util", () => {
    const buf = Buffer.from([Negotiation.IAC, Negotiation.DO, 201]);
    expect([buf]).toStrictEqual(Util.splitIAC(buf));
});
