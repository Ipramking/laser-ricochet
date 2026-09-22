import solc from 'solc';
import fs from 'fs';
const sources = {
  'ICasinoGameV2.sol': { content: fs.readFileSync('contracts/ICasinoGameV2.sol', 'utf8') },
  'LaserRicochet.sol': { content: fs.readFileSync('contracts/LaserRicochet.sol', 'utf8') },
};
const input = {
  language: 'Solidity',
  sources,
  settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
};
const findImports = (p) => {
  const name = p.replace('./', '');
  return sources[name] ? { contents: sources[name].content } : { error: 'not found: ' + p };
};
const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
const errs = (out.errors || []).filter((e) => e.severity === 'error');
const warns = (out.errors || []).filter((e) => e.severity === 'warning');
warns.forEach((w) => console.log('WARN:', w.formattedMessage.split('\n')[0]));
if (errs.length) { errs.forEach((e) => console.log(e.formattedMessage)); process.exit(1); }
const c = out.contracts['LaserRicochet.sol']['LaserRicochet'];
console.log('COMPILE OK. bytecode bytes:', c.evm.bytecode.object.length / 2,
  '| fns:', c.abi.filter((x) => x.type === 'function').map((x) => x.name).join(','));
