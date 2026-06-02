/** Lightweight BM25 scorer for hybrid retrieval */

const K1 = 1.2;
const B = 0.75;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_./-]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

export class BM25Index {
  private docs: string[][] = [];
  private docLengths: number[] = [];
  private avgDl = 0;
  private df = new Map<string, number>();
  private idf = new Map<string, number>();
  private N = 0;

  constructor(texts: string[]) {
    this.build(texts);
  }

  private build(texts: string[]) {
    this.N = texts.length;
    this.docs = texts.map(tokenize);
    this.docLengths = this.docs.map((d) => d.length);
    this.avgDl =
      this.docLengths.reduce((a, b) => a + b, 0) / Math.max(this.N, 1);

    for (const doc of this.docs) {
      const seen = new Set<string>();
      for (const term of doc) {
        if (!seen.has(term)) {
          seen.add(term);
          this.df.set(term, (this.df.get(term) ?? 0) + 1);
        }
      }
    }

    for (const [term, df] of this.df) {
      this.idf.set(
        term,
        Math.log(1 + (this.N - df + 0.5) / (df + 0.5)),
      );
    }
  }

  score(query: string): number[] {
    const qTerms = tokenize(query);
    const scores = new Array(this.N).fill(0);

    for (let i = 0; i < this.N; i++) {
      const doc = this.docs[i];
      const dl = this.docLengths[i];
      const tf = new Map<string, number>();
      for (const t of doc) tf.set(t, (tf.get(t) ?? 0) + 1);

      for (const term of qTerms) {
        const freq = tf.get(term) ?? 0;
        if (freq === 0) continue;
        const idf = this.idf.get(term) ?? 0;
        const num = freq * (K1 + 1);
        const den = freq + K1 * (1 - B + (B * dl) / this.avgDl);
        scores[i] += idf * (num / den);
      }
    }

    return scores;
  }
}
