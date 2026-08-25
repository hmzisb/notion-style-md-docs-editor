export interface PerfCorpusOptions {
    /** Total page nodes to emit, index pages included. */
    nodes?: number;
    /** Blocks in the single large page. */
    blocks?: number;
    /** Target directory. A fresh temp directory is created when omitted. */
    dir?: string;
}
export interface PerfCorpus {
    dir: string;
    /** Files written, including the large page. */
    files: number;
    /** Page nodes the walker should find. */
    nodes: number;
    /** Corpus-relative path of the large page. */
    largePage: string;
    bytes: number;
}
/** Body of the large page: 3k blocks cycling through the block set the editor supports. */
export declare function generateLargePage(blocks: number): string;
export declare function generatePerfCorpus(opts?: PerfCorpusOptions): Promise<PerfCorpus>;
//# sourceMappingURL=gen.d.ts.map