export interface IGMCP {
    package: string[];
    data: { [key: string]: any };
}

export function parseGMCP(data: Buffer): IGMCP {
    const dstr: string = data.toString();
    const offset: number = dstr.indexOf(" ");
    const pack: string[] = dstr.substring(0, offset).split(".");
    const json: string = dstr.substring(offset + 1);
    const obj = JSON.parse(json);
    return {
        package: pack,
        data: obj,
    };
}
