export function secureDrawIndex(total:number, random?:()=>number) {
  if (!Number.isInteger(total) || total<1 || total>10000) throw new Error('Quantidade de números inválida.');
  const next = random || (() => crypto.getRandomValues(new Uint32Array(1))[0]);
  const limit = 4294967296 - 4294967296 % total;
  let sample:number;
  do { sample=next(); if (!Number.isInteger(sample) || sample<0 || sample>=4294967296) throw new Error('Amostra aleatória inválida.'); } while (sample>=limit);
  return { sample,index:sample%total };
}
