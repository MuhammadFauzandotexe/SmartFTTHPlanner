import {DEFAULT_FAT_PORTS,DEFAULT_MAX_DROP_LENGTH_METERS,DEFAULT_MAX_FATS_PER_POLE,validateFatPorts,validateMaxDropLengthMeters,validateMaxFatsPerPole,type FtthPlan} from './ftth-planning'
import {emptyDistribution} from './distribution'
export type WorkspaceConfiguration={fatPorts:number;maxDropLengthMeters:number;maxFatsPerPole:number;candidateRadiusMeters:number;candidateNeighbors:number}
export type WorkspaceActivity='data'|'fat'|'distribution'|'inspection'
export type InspectionTab='summary'|'issues'|'routes'|'proposals'|'log'
export const defaultWorkspaceConfiguration=():WorkspaceConfiguration=>{const distribution=emptyDistribution();return {fatPorts:DEFAULT_FAT_PORTS,maxDropLengthMeters:DEFAULT_MAX_DROP_LENGTH_METERS,maxFatsPerPole:DEFAULT_MAX_FATS_PER_POLE,candidateRadiusMeters:distribution.candidateRadiusMeters,candidateNeighbors:distribution.candidateNeighbors}}
export function validateWorkspaceConfiguration(config:WorkspaceConfiguration):WorkspaceConfiguration{
 validateFatPorts(config.fatPorts);validateMaxDropLengthMeters(config.maxDropLengthMeters);validateMaxFatsPerPole(config.maxFatsPerPole)
 if(!Number.isFinite(config.candidateRadiusMeters)||config.candidateRadiusMeters<=0)throw new Error('Radius kandidat harus angka positif dan terbatas dalam meter.')
 if(!Number.isInteger(config.candidateNeighbors)||config.candidateNeighbors<1||config.candidateNeighbors>10)throw new Error('Jumlah tetangga kandidat harus bilangan bulat 1–10.')
 return config
}
export function serviceResultsStale(plan:FtthPlan|null,sourceMatches:boolean,config:WorkspaceConfiguration):boolean{
 return !!plan&&(!sourceMatches||plan.fatPorts!==config.fatPorts||plan.maxDropLengthMeters!==config.maxDropLengthMeters)
}
export const projectSignature=(features:unknown,plan:unknown,allocations:unknown,configuration:unknown,distribution:unknown)=>JSON.stringify([features,plan,allocations,configuration,distribution])
