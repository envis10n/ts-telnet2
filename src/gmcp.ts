export interface IGMCP {
    package: string;
    data: { [key: string]: any };
}

export function parseGMCP(data: Buffer): IGMCP {
    const dstr: string = data.toString();
    const offset: number = dstr.indexOf(" ");
    if (offset > -1) {
        const pack: string = dstr.substring(0, offset);
        const json: string = dstr.substring(offset + 1);
        const obj = JSON.parse(json);
        return {
            package: pack,
            data: obj,
        };
    } else {
        return {
            package: dstr,
            data: {},
        };
    }
}
