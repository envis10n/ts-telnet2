import { Util, Negotiation, Options } from "../";

test("util", () => {
    console.log(Util.writeIAC(Negotiation.DO, Options.ECHO));

    console.log(Util.writeSB(Options.CHARSET, "UTF-8"));
});
