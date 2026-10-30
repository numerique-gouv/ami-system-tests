/**
 * Comptes de la maquette FranceConnect publique (mot de passe « 123 »), clé = colonne `login` du CSV :
 * https://github.com/france-connect/sources/blob/main/docker/volumes/fcp-high/mocks/idp/databases/citizen/base.csv
 */
import { computeFcHash, type FcPivotData } from './fc-hash'

function account(password: string, pivot: FcPivotData): { password: string; pivot: FcPivotData; fcHash: string } {
  return { password, pivot, fcHash: computeFcHash(pivot) }
}

const credentials = {
  // Paris 7e (arrondissement, 75107), trois prénoms
  test: account('123', {
    given_name: 'Angela Claire Louise', family_name: 'DUBOIS', birthdate: '1962-08-24',
    gender: 'female', birthplace: '75107', birthcountry: '99100',
  }),
  // nom d'usage renseigné (preferred_username), commune du Val-d'Oise
  avec_nom_dusage: account('123', {
    given_name: 'Pierre', family_name: 'MERCIER', birthdate: '1969-03-17',
    gender: 'male', birthplace: '95277', birthcountry: '99100',
  }),
  // pas de nom d'usage, deux prénoms
  sans_nom_dusage: account('123', {
    given_name: 'Paul Louis', family_name: 'DUPONT', birthdate: '1962-08-24',
    gender: 'male', birthplace: '75107', birthcountry: '99100',
  }),
  // nom composé, Marseille 12e (13012)
  'nom_composé': account('123', {
    given_name: 'Melissandre Juliette', family_name: 'TROIS-DUPRE', birthdate: '1981-07-27',
    gender: 'female', birthplace: '13012', birthcountry: '99100',
  }),
  // prénom composé avec trait d'union, Toulouse (31555)
  'prénom_composé': account('123', {
    given_name: 'Anne-Laure', family_name: 'HUCHE', birthdate: '1945-09-30',
    gender: 'female', birthplace: '31555', birthcountry: '99100',
  }),
  // caractères spéciaux œ æ Œ Æ et accents, naissance en Corse (2B002)
  carac_speciaux: account('123', {
    given_name: 'JulieéàèùòœæŒÆ', family_name: 'DURANTéàèùòœæŒÆ', birthdate: '1972-06-14',
    gender: 'female', birthplace: '2B002', birthcountry: '99100',
  }),
  // né à l'étranger : birthplace vide, birthcountry 99352
  'naissance_Algérie': account('123', {
    given_name: 'Vincent Guillaume', family_name: 'MARTIN', birthdate: '1963-12-05',
    gender: 'male', birthplace: '', birthcountry: '99352',
  }),
  // né à l'étranger : birthplace vide, birthcountry 99127
  naissance_Italie: account('123', {
    given_name: 'Julien Bernard Pierre', family_name: 'LIVRE', birthdate: '1984-01-23',
    gender: 'male', birthplace: '', birthcountry: '99127',
  }),
  // né en Polynésie française (COM, 98729)
  'naissance_polynesie_française': account('123', {
    given_name: 'Titouan', family_name: 'REVEIL', birthdate: '1998-06-18',
    gender: 'male', birthplace: '98729', birthcountry: '99100',
  }),
  // mineur (né en 2015)
  moins_16_ans: account('123', {
    given_name: 'Alain', family_name: 'POSTEUR', birthdate: '2015-06-20',
    gender: 'male', birthplace: '75113', birthcountry: '99100',
  }),
  // genre « unspecified »
  'genre_indéfini': account('123', {
    given_name: 'Camille', family_name: 'LAFORGE', birthdate: '1954-08-07',
    gender: 'unspecified', birthplace: '75119', birthcountry: '99100',
  }),
  // naissance en Corse-du-Sud (2A004), nom d'usage différent
  test_CORSE_2A: account('123', {
    given_name: 'Mario', family_name: 'Brosse', birthdate: '1981-02-03',
    gender: 'male', birthplace: '2A004', birthcountry: '99100',
  }),
}

export type FcLogin = keyof typeof credentials

export interface TestUser {
  login: FcLogin
  password: string
  fcHash: string
}

export function getUser(login: FcLogin): TestUser {
  const { password, fcHash } = credentials[login]
  return { login, password, fcHash }
}

/** Compte de la session : `TEST_USER` (un login ci-dessus), valeur par défaut posée par wdio.base.conf.ts. */
export function getTestUser(): TestUser {
  const login = process.env.TEST_USER
  if (!login || !Object.hasOwn(credentials, login)) {
    throw new Error(`TEST_USER inconnu : ${login}`)
  }
  return getUser(login as FcLogin)
}
