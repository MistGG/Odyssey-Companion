export type MapleRegion =
  | 'EMS'
  | 'KMST'
  | 'GMS'
  | 'THMS'
  | 'TWMS'
  | 'CMS'
  | 'KMS'
  | 'TMS'
  | 'CMST'
  | 'SEA'
  | 'JMS'

export type MapleWzVersion = {
  version: number
  region: MapleRegion
}

export type MapleDamageSkinItem = {
  id: number
  name: string
}
