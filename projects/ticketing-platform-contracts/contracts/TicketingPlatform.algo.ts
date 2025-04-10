import {  Contract } from '@algorandfoundation/tealscript';

type listingKey = {asset: AssetID}; 
//gli asset sono unici, anche con un nonce si potrebbero avere piu' listing per lo stesso asset

//se si usa zkp, si puo' evitare di dover specificare il proprietario?

type listingValue = {owner: Address, unitaryPrice: uint64};
//la quantita' venduta e' sempre 1, essendo gli asset unici

const listingMbr = 2_500 + (4_00 * 48);
//(AssetId) -> (Address, price)
//(uint64) -> (Address, unit64)
//(8) -> (32 + 8) = 48b 
//2_500 creazione box; 4_00 per ogni byte nel box

export class TicketingPlatform extends Contract {

  listings = BoxMap<listingKey,listingValue>();

  //un utente paga perche' il contratto possa gestire un certo asset
  //dopo chiunque potra' mettere in vendita questo asset senza pagare
  //il costo puo' essere recuperato solo se tutti gli altri utenti chiudessero i propri listing con questo asset
  private optInToAsset(asset: AssetID): void {

    //controllo che il contratto non abbia gia' fatto opt-in all'asset desiderato
    assert(!this.app.address.isOptedInToAsset(asset));

    //effettua una transazione di opt-in 
    // (asset transfer vuota da contratto a contratto per l'asset desiderato)
    sendAssetTransfer({
      assetSender: this.app.address,
      assetReceiver: this.app.address,
      xferAsset: asset,
      assetAmount: 0,
    });
  }

  //creazione di un nuovo listing
  //se non c'e' stato opt-in per l'asset viene fatto automaticamente
  public newListing(appCall: AppCallTxn, xfer: AssetTransferTxn, unitaryPrice: uint64, mbrPay: PayTxn ) :void {

    //il prezzo non puo' essere 0
    assert(unitaryPrice > 0);

    //non devono esistere listing per questo asset
    assert(!this.listings({
      asset: xfer.xferAsset  //asset trasferito sul contratto
    }).exists);

    //se non e' ancora stato fatto opt-in all'asset
    if(!this.app.address.isOptedInToAsset(xfer.xferAsset)) {

      //l'utente paghi sia per il listing che per l'opt-in
      verifyPayTxn(mbrPay, {
        sender: appCall.sender,
        receiver: this.app.address,
        amount: listingMbr + globals.assetOptInMinBalance 
      });

      this.optInToAsset(xfer.xferAsset);

    }else {

      //se c'e' gia' stato opt-in l'utente paghi solo per creare il box
      verifyPayTxn(mbrPay, {
        sender: appCall.sender,
        receiver: this.app.address,
        amount: listingMbr
      })
    }

    //in ogni caso verificare che un asset sia stato inviato dal chiamante al contratto
    verifyAssetTransferTxn(xfer, {
      sender: appCall.sender,
      assetReceiver: this.app.address,
      assetAmount: 1,
    });

    //creare il box  
    // per l'asset dato  con il prezzo dato
    // Il proprieatario del listing e' il chiamante del metodo
    this.listings({ //creazione chiave
      asset: xfer.xferAsset,
    }).value = { owner: appCall.sender, unitaryPrice: unitaryPrice}

  }

  //cambiare il prezzo di un listing
  public changePrice(appCall: AppCallTxn, asset: AssetID, newPrice: uint64): void {

    //il nuovo prezzo non puo' essere 0
    assert(newPrice > 0);

    //il prezzo puo' essere cambiato solo dal proprietario dell'asset
    assert(this.listings({asset:asset}).value.owner == appCall.sender);

    this.listings({ //estrazione per asset dato
      asset: asset,
    }).value = {owner: appCall.sender, unitaryPrice: newPrice} //sovrascizione valore

    //se nessun listing per questo asset e per questo utente esiste, il metodo fallisce (?)

  }

  //compra l'asset dato
  public buy(appCall: AppCallTxn, asset: AssetID, buyPay: PayTxn) : void {

    //estraggo prezzo attuale e proprietario dell'asset
    const currentPrice = this.listings({asset: asset}).value.unitaryPrice;
    const owner = this.listings({asset: asset}).value.owner;

    //resto del pagamento dell'asset
    const change = buyPay.amount - currentPrice;

    //verifica che il pagamento copra il prezzo del biglietto
    verifyTxn(buyPay, {
      sender: appCall.sender, //il pagamento deve venire dal futuro proprietario
      receiver: owner, //il destinatario e' direttamente il propietario dell'asset, non il contratto
      amount: {greaterThanEqualTo: currentPrice}
    });

    //invia l'asset desiderato al chiamante del metodo
    sendAssetTransfer({
      xferAsset: asset, //argomento
      assetReceiver: appCall.sender, //chiamante
      assetAmount: 1,
    });

    //invia l'eventuale resto al chiamante
    if(change > 0) {
      sendPayment({
        sender: owner, //il resto viene dal destinatario del pagamento, non dal contratto
        receiver: appCall.sender, //al chiamante, ovvero al compratore
        amount: change,
      })
    }

    //recupero spese per spazio listing al proprietario del box
    sendPayment({
      sender: this.app.address, //dal contratto
      receiver: owner, //al (vecchio) proprietario dell'asset
      amount: listingMbr,
    });

    //eliminazione box del listing
    this.listings({asset: asset}).delete();

  }

  //ritira un asset invenduto
  //elimina il relativo box recuperando le relative spese
  public withdrawAsset(appCall: AppCallTxn, asset: AssetID): void {

    //deve esistere un listing per l'asset dato
    assert(this.listings({asset: asset}).exists);

    //il listing eliminato deve appartenere al chiamante
    assert(this.listings({asset:asset}).value.owner == appCall.sender);

  
    //recupero prezzo del box
    sendPayment({
      receiver: appCall.sender, //al chiamante ovvero al proprietario del box per assert
      amount: listingMbr,
    })

    //reinvio dell'asset al proprietario del listing
    sendAssetTransfer({
      assetReceiver: appCall.sender, //chiamante ovvero creatore del listing per assert
      xferAsset: asset, //argomento
      assetAmount: 1,
    });

    //eliminazione del box
    this.listings({asset:asset}).delete();


  }
  
  //scambio di due asset che si trovino entrambi nel contratto
  private swap(asset1: AssetID, asset2: AssetID): void {

    //assert che esistano listing per entrambi
    assert(this.listings({asset:asset1}).exists);
    assert(this.listings({asset:asset2}).exists);

    //estraggo i proprietari
    const owner1 = this.listings({asset:asset1}).value.owner;
    const owner2 = this.listings({asset:asset2}).value.owner;

    //scambio asset
    sendAssetTransfer({
      assetReceiver: owner2,
      xferAsset: asset1,
      assetAmount: 1,
    });

    sendAssetTransfer({
      assetReceiver: owner1,
      xferAsset: asset2,
      assetAmount: 1,
    });
    

    //eliminazione listing
    this.listings({asset:asset1}).delete();
    this.listings({asset:asset2}).delete();

    

  }


}
