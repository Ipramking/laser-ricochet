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

// Emit a self-contained deploy artifact (ABI + bytecode) so the contract can be
// deployed to any RPC with tools/deploy.mjs — no Solidity toolchain needed.
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/LaserRicochet.json', JSON.stringify({
  contractName: 'LaserRicochet',
  compiler: 'solc 0.8.30 (optimizer 200, viaIR)',
  abi: c.abi,
  bytecode: '0x' + c.evm.bytecode.object,
}, null, 2) + '\n');

console.log('COMPILE OK -> artifacts/LaserRicochet.json | bytecode bytes:', c.evm.bytecode.object.length / 2,
  '| fns:', c.abi.filter((x) => x.type === 'function').map((x) => x.name).join(','));
