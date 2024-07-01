import { Address, beginCell, Cell, Contract, ContractProvider, Sender, SendMode, Slice } from '@ton/core';

export class JettonWallet implements Contract {
  static readonly OPCODES = {
    TRANSFER: 0xf8a7ea5,
  };

  constructor(
    readonly address: Address,
  ) {
  }

  static createFromAddress(address: Address) {
    return new JettonWallet(address);
  }

  /**
   * Sends message of jetton transfer to jetton wallet. More about jetton transfers here https://docs.ton.org/develop/dapps/asset-processing/jettons
   */
  async sendTransfer(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint;
      toAddress: Address;
      queryId?: number;
      fwdAmount: bigint;
      jettonAmount: bigint;
    } & ({
      forwardPayload?: Cell | Slice | null;
    } | {
      comment: string;
    }),
  ) {
    // constructing payload for jetton transfer
    const builder = beginCell()
      .storeUint(JettonWallet.OPCODES.TRANSFER, 32) // opcode for transfer. 0xf8a7ea5 is used
      .storeUint(opts.queryId ?? 0, 64)
      .storeCoins(opts.jettonAmount) // jetton amount to transfer. Be aware of decimals. Almost all jettons has 9, but USDT has 6. More about decimals https://docs.ton.org/develop/dapps/asset-processing/metadata#jetton-metadata-attributes
      .storeAddress(opts.toAddress) // jetton destination address. Use wallet address, not jetton address itself
      .storeAddress(via.address) // excesses address. Extra tons, sent with message, will be transferred here.
      .storeUint(0, 1) // custom payload. Empty in standard jettons
      .storeCoins(opts.fwdAmount); // notifications ton amount. In case of simple jetton transfer just 1 nanoTon is OK.

    // if comment needed, it stored as Cell ref
    if ('comment' in opts) {
      const commentPayload = beginCell()
        .storeUint(0, 32)
        .storeStringTail(opts.comment)
        .endCell();

      builder.storeBit(1);
      builder.storeRef(commentPayload);
    } else {
      // if not, store forward payload
      if (opts.forwardPayload instanceof Slice) {
        builder.storeBit(0);
        builder.storeSlice(opts.forwardPayload);
      } else if (opts.forwardPayload instanceof Cell) {
        builder.storeBit(1);
        builder.storeRef(opts.forwardPayload);
      } else {
        builder.storeBit(0);
      }
    }

    // provider often obtained via client.open(contract) method
    await provider.internal(via, {
      value: opts.value, // value to pay gas
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: builder.endCell(),
    });
  }

  async getWalletData(provider: ContractProvider): Promise<{
    balance: bigint;
    ownerAddress: Address;
    jettonMasterAddress: Address;
    jettonWalletCode: Cell;
  }> {
    const { stack } = await provider.get('get_wallet_data', []);

    return {
      balance: stack.readBigNumber(),
      ownerAddress: stack.readAddress(),
      jettonMasterAddress: stack.readAddress(),
      jettonWalletCode: stack.readCell(),
    };
  }
}
