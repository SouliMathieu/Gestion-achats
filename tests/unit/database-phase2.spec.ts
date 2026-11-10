import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseService } from '../../src/services/database.service';
import { TABLE_NAMES } from '../../src/services/database-schema';
function prepare(){localStorage.clear();for(const key of TABLE_NAMES)localStorage.setItem(key,'[]');}
afterEach(()=>localStorage.clear());
describe('Phase 2 — conservation et normalisation',()=>{
 it('change uniquement le statut et conserve les champs historiques',async()=>{
  prepare();localStorage.setItem('commandes',JSON.stringify([{id:'TEST-C',numero:'CMD-TEST-001',date_creation:'2020-01-01',fournisseur_id:'TEST-F',cout_total:0,notes:'TEST',legacy:'keep',statut:'brouillon'}]));
  const db=new DatabaseService({platform:'web'});await db.updateCommandeStatus('TEST-C','recue');
  const stored=JSON.parse(localStorage.getItem('commandes')||'[]')[0];
  expect(stored).toMatchObject({numero:'CMD-TEST-001',date_creation:'2020-01-01',fournisseur_id:'TEST-F',cout_total:0,notes:'TEST',legacy:'keep',statut:'recue'});
  expect((await db.getCommandes())[0]).toMatchObject({dateCreation:'2020-01-01',fournisseurId:'TEST-F',coutTotal:0});
 });
 it('normalise les alias sans réécrire les cinq collections historiques',async()=>{
  prepare();const fixtures:any={articles:[{id:'A',fournisseur_id:'F',prix:0}],fournisseurs:[{id:'F',reseaux_sociaux:'R',articles_principaux:'P'}],transport:[{id:'T',ville_depart:'D',pays_arrivee:'P'}],commandes:[{id:'C',date_commande:'2020-01-01',cout_total:0}],commande_lignes:[{id:'L',commande_id:'C',article_id:'A',prix_unitaire:0}]};
  for(const [key,value] of Object.entries(fixtures))localStorage.setItem(key,JSON.stringify(value));
  const before=Object.fromEntries(Object.keys(fixtures).map(key=>[key,localStorage.getItem(key)]));const db=new DatabaseService({platform:'web'});
  expect((await db.getArticles())[0]).toMatchObject({fournisseurId:'F',prix:0});
  expect((await db.getFournisseurs())[0]).toMatchObject({reseauxSociaux:'R',articlesPrincipaux:'P'});
  expect((await db.getTransports())[0]).toMatchObject({villeDepart:'D',paysArrivee:'P'});
  expect((await db.getCommandes())[0]).toMatchObject({dateCommande:'2020-01-01',coutTotal:0});
  expect((await db.getCommandeById('C'))?.lignes[0]).toMatchObject({commandeId:'C',articleId:'A',prixUnitaire:0});
  for(const [key,value] of Object.entries(before))expect(localStorage.getItem(key)).toBe(value);
 });
 it('une modification partielle d’article conserve photos, dates et champs inconnus',async()=>{
  prepare();localStorage.setItem('articles',JSON.stringify([{id:'A',date_creation:'2020-01-01',photos:'TEST-photo',fournisseur_id:'F',extra:'keep'}]));
  const db=new DatabaseService({platform:'web'});await db.updateArticle('A',{statut:'stock',prix:0});
  expect(JSON.parse(localStorage.getItem('articles')||'[]')[0]).toMatchObject({date_creation:'2020-01-01',photos:'TEST-photo',fournisseur_id:'F',extra:'keep',statut:'stock',prix:0});
 });
});
