// One-command deploy for LaserRicochet. The contract has no constructor args, so
// deployment is a single transaction against any EVM RPC. Mirrors the proven local
// deployment (the SDK simulator deploys this exact bytecode and settles bets against it).
//
// Usage:
//   node tools/deploy.mjs --rpc-url <RPC> --private-key <0x...>
//   (or: npm run deploy:contract -- --rpc-url <RPC> --private-key <0x...>)
//
// Examples:
//   Base Sepolia : --rpc-url https://sepolia.base.org
//   Base mainnet : --rpc-url https://mainnet.base.org
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, defineChain, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const here = dirname(fileURLToPath(import.meta.url));

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : process.env[name.toUpperCase().replace(/-/g, '_')];
}

const rpcUrl = arg('rpc-url');
let pk = arg('private-key');
if (!rpcUrl || !pk) {
  console.error('Usage: node tools/deploy.mjs --rpc-url <RPC> --private-key <0x...>');
  process.exit(1);
}
if (!pk.startsWith('0x')) pk = '0x' + pk;

const artifact = JSON.parse(readFileSync(resolve(here, '../artifacts/LaserRicochet.json'), 'utf8'));
const account = privateKeyToAccount(pk);
const probe = createPublicClient({ transport: http(rpcUrl) });
const chainId = await probe.getChainId();
const chain = defineChain({ id: chainId, name: `chain-${chainId}`, nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } });
const pub = createPublicClient({ chain, transport: http(rpcUrl) });
const wal = createWalletClient({ account, chain, transport: http(rpcUrl) });

console.log(`Deploying LaserRicochet from ${account.address} to chainId ${chainId} (${rpcUrl})…`);

const hash = await wal.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, account, chain });
console.log('tx:', hash);
const rcpt = await pub.waitForTransactionReceipt({ hash });
if (!rcpt.contractAddress) { console.error('Deployment produced no address'); process.exit(1); }
console.log('\n✅ LaserRicochet deployed at:', rcpt.contractAddress);
console.log('   block:', rcpt.blockNumber, '| gas used:', rcpt.gasUsed);
console.log('\nInclude this address + tx hash in your jam submission / hand it to the Chain.wtf team for whitelisting.');
