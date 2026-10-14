import type mysql from 'mysql2/promise'

/** Seed provenance, never a nickname heuristic. Bound seed identities may be real users. */
export function officialRosterProjection(rows:Array<Record<string,unknown>>){
 const hidden=rows.filter(row=>!row.userId&&(row.batch==='dev-seed-v1'||row.type==='student'&&row.id==='00000000-0000-4000-8000-000000000001'))
 const people=rows.filter(row=>!hidden.includes(row)).map(row=>{
  const state=identityDirectoryState({type:String(row.type),status:String(row.identityStatus||'available'),userId:row.userId?String(row.userId):null,
   name:row.name?String(row.name):null,university:row.university?String(row.university):null,assignmentCount:Number(row.assignmentCount||0)})
  const claimed=state.profileState!=='unclaimed'
  return {id:String(row.id),name:!claimed?(row.type==='student'?'未认领学员':'未认领老师'):state.profileState==='incomplete'?'资料待完善':state.nameLabel,
   university:claimed?state.schoolLabel:'学校待补充',major:claimed?String(row.major||'专业待补充'):'专业待补充',currentStage:row.currentStage||null,
   title:row.title||null,status:row.status||'active',businessId:row.businessId||null,
   stateLabel:!claimed?'未认领':state.profileState==='incomplete'?'资料待完善':state.assignmentState==='unassigned'?(row.type==='student'?'已认领未分配老师':'已认领未分配学员'):'已认领 · 已分配',
   canView:claimed&&row.userStatus==='active'&&row.identityStatus==='claimed'&&
    (row.type==='student'?row.accountRole==='student':['teacher','staff'].includes(String(row.accountRole)))&&row.status!=='inactive',
   provenance:row.batch==='dev-seed-v1'?'bound_seed_requires_review':'business_record'}
 })
 return {students:people.filter(row=>rows.find(raw=>raw.id===row.id)?.type==='student'),teachers:people.filter(row=>rows.find(raw=>raw.id===row.id)?.type==='teacher'),isolatedUnclaimedSeedCount:hidden.length}
}

export async function readAdminReadOnlyRoster(pool:mysql.Pool){
 const [students]=await pool.query<mysql.RowDataPacket[]>(`SELECT s.id,'student' AS type,s.user_id AS userId,s.name,
  COALESCE(NULLIF(p.university,''),s.university) AS university,COALESCE(NULLIF(p.major,''),s.major) AS major,s.current_stage AS currentStage,
  i.batch,i.business_id AS businessId,i.status AS identityStatus,u.status AS userStatus,u.role AS accountRole,
  (SELECT COUNT(DISTINCT a.teacher_id) FROM student_teacher_assignments a JOIN teachers t ON t.id=a.teacher_id AND t.status='active' WHERE a.student_id=s.id) AS assignmentCount
  FROM students s LEFT JOIN users u ON u.id=s.user_id LEFT JOIN user_profiles p ON p.user_id=s.user_id
  LEFT JOIN internal_ids i ON i.type='student' AND i.entity_id=s.id AND (s.user_id IS NULL OR i.user_id=s.user_id) ORDER BY s.created_at,s.id`)
 const [teachers]=await pool.query<mysql.RowDataPacket[]>(`SELECT t.id,'teacher' AS type,t.user_id AS userId,t.name,t.title,t.status,
  i.batch,i.business_id AS businessId,i.status AS identityStatus,u.status AS userStatus,u.role AS accountRole,
  (SELECT COUNT(DISTINCT a.student_id) FROM student_teacher_assignments a JOIN students s ON s.id=a.student_id AND s.user_id IS NOT NULL WHERE a.teacher_id=t.id) AS assignmentCount
  FROM teachers t LEFT JOIN users u ON u.id=t.user_id
  LEFT JOIN internal_ids i ON i.type='teacher' AND i.entity_id=t.id AND (t.user_id IS NULL OR i.user_id=t.user_id) ORDER BY t.created_at,t.id`)
 return officialRosterProjection([...students,...teachers])
}

export function identityDirectoryState(row:{type:string;status:string;userId:string|null;name:string|null;university:string|null;assignmentCount:number|null;displayName?:string|null;userStatus?:string|null}){
 const testNamed=Boolean([row.name,row.displayName].some(v=>v&&/测试|体验|演示|^test\b|^demo\b|^学员[-－]?JCS|^老师[-－]?JCT/i.test(v)))
 const claimed=['claimed','disabled'].includes(row.status)&&Boolean(row.userId)
 const nameIncomplete=!row.name?.trim()||Boolean(row.name&&/测试|体验|演示|^test\b|^demo\b|^学员[-－]?JCS|^老师[-－]?JCT/i.test(row.name))
 const profileIncomplete=claimed&&(nameIncomplete||row.type==='student'&&!row.university?.trim())
 return {...row,
  profileState:claimed?(profileIncomplete?'incomplete':'recorded'):'unclaimed',
  nameLabel:!claimed?'未认领':nameIncomplete?'待完善实名':row.name,
  schoolLabel:row.type==='student'?(row.university?.trim()||'学校待完善'):null,
  assignmentState:!claimed?'unclaimed':row.type==='admin'?'not_recorded':row.assignmentCount===null?'not_recorded':row.assignmentCount>0?'assigned':'unassigned',
  assignmentLabel:!claimed?'未认领':row.type==='admin'?'未分配':row.assignmentCount===null?'分配状态待核实':row.assignmentCount>0?'已分配':'未分配',
  auditCategory:testNamed?(row.userId?'test_named_bound':'test_named_unclaimed'):'no_test_name',
  nameVerification:'not_recorded' as const,
 }
}

/** Protected read model only. Does not mutate names, grants, identities or relationships. */
export async function readAdminIdentityDirectory(pool:mysql.Pool){
 const [rows]=await pool.query<mysql.RowDataPacket[]>(`
 SELECT i.id,i.business_id AS businessId,i.type,i.claim_mode AS claimMode,i.status,
 i.user_id AS userId,i.entity_id AS entityId,i.batch,i.claimed_at AS claimedAt,
 u.display_name AS displayName,u.status AS userStatus,u.role AS accountRole,
 CASE WHEN i.type='student' THEN s.name WHEN i.type='teacher' THEN t.name ELSE NULL END AS name,
 CASE WHEN i.type='student' THEN COALESCE(NULLIF(p.university,''),s.university) ELSE NULL END AS university,
 CASE WHEN i.type='student' THEN COALESCE(NULLIF(p.major,''),s.major) ELSE NULL END AS major,
 CASE WHEN i.type='student' THEN s.current_stage ELSE NULL END AS currentStage,
 t.status AS teacherStatus,
 CASE WHEN i.type='student' THEN (SELECT COUNT(DISTINCT sa.teacher_id) FROM student_teacher_assignments sa WHERE sa.student_id=s.id)
 WHEN i.type='teacher' THEN (SELECT COUNT(DISTINCT sa.student_id) FROM student_teacher_assignments sa JOIN students assigned ON assigned.id=sa.student_id WHERE sa.teacher_id=t.id AND assigned.user_id IS NOT NULL)
 ELSE NULL END AS assignmentCount
 FROM internal_ids i LEFT JOIN users u ON u.id=i.user_id
 LEFT JOIN students s ON i.type='student' AND s.id=i.entity_id AND (i.user_id IS NULL OR s.user_id=i.user_id)
 LEFT JOIN teachers t ON i.type='teacher' AND t.id=i.entity_id AND (i.user_id IS NULL OR t.user_id=i.user_id)
 LEFT JOIN user_profiles p ON p.user_id=i.user_id
 ORDER BY i.created_at,i.id`)
 return rows.map(row=>identityDirectoryState({...row,type:String(row.type),status:String(row.status),userId:row.userId?String(row.userId):null,
   name:row.name?String(row.name):null,university:row.university?String(row.university):null,assignmentCount:row.assignmentCount===null?null:Number(row.assignmentCount),displayName:row.displayName?String(row.displayName):null,userStatus:row.userStatus?String(row.userStatus):null}))
}
