import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { DatabaseContext } from '../db/client.js'
import {
  assessments, growthRecords, planRevisions, scheduleImports,
  studentTeacherAssignments, students, teachers, userProfiles,
} from '../db/schema.js'
import { STAGE_DEFINITIONS, getStageDefinition } from '../domain/classroom.js'
import { missingOptionalTableAsEmpty } from '../domain/optional-table.js'
import { mayViewStudent, mayViewTeacher, pickClassroomStudent } from '../domain/read-only-access.js'
import { resolveSessionUser } from '../services/session.js'
import { loadClassroom } from './classroom-workspace.js'

type DB = Extract<DatabaseContext,{configured:true}>

export async function authorizedStudent(
  db:DB, role:string, operatorId:string, targetId:string,
) {
  if (!mayViewStudent(role,false) && role !== 'teacher') return false
  if (role === 'admin') return true
  const [assignment] = await db.db.select({id:studentTeacherAssignments.id})
    .from(studentTeacherAssignments)
    .innerJoin(teachers,eq(studentTeacherAssignments.teacherId,teachers.id))
    .where(and(eq(teachers.userId,operatorId),eq(teachers.status,'active'),
      eq(studentTeacherAssignments.studentId,targetId))).limit(1)
  return mayViewStudent(role,Boolean(assignment))
}

/** Isolated GET-only read projections. The operator session stays unchanged.
 * No /me owner override and no write/AI/payment endpoint accepts the target ID.
 */
export function registerReadOnlyWorkspaceRoutes(app:FastifyInstance,database:DatabaseContext) {
  app.get<{Params:{studentId:string};Querystring:{stage?:string;only?:string}}>(
    '/me/read-only/students/:studentId',async(request,reply)=>{
      if(!database.configured)return reply.code(503).send({ok:false,error:'database_not_configured'})
      const operator=await resolveSessionUser(request,database)
      if(!operator)return reply.code(401).send({ok:false,error:'unauthorized'})
      if(!(await authorizedStudent(database,operator.role,operator.userId,request.params.studentId)))
        return reply.code(403).send({ok:false,error:'read_only_target_forbidden'})

      const [student]=await database.db.select({
        id:students.id,userId:students.userId,name:students.name,
        university:students.university,major:students.major,currentStage:students.currentStage,
      }).from(students).where(eq(students.id,request.params.studentId)).limit(1)
      if(!student)return reply.code(404).send({ok:false,error:'student_not_found'})
      const stageCode=request.query.stage || student.currentStage || 'freshman-fall'
      if(!getStageDefinition(stageCode))return reply.code(400).send({ok:false,error:'invalid_stage'})
      // Keep stage plans loaded by the canonical classroom logic (incl. pending revisions).
      const publicStudent=pickClassroomStudent(student)
      const classroom=await loadClassroom(database,publicStudent,stageCode,true)
      if(request.query.only==='classroom'){
        return {ok:true,readOnly:true,classroom}
      }
      const [profile]=student.userId?await database.db.select({
        university:userProfiles.university,major:userProfiles.major,
        currentGrade:userProfiles.currentGrade,
        gpaText:userProfiles.gpaText,rankText:userProfiles.rankText,
      }).from(userProfiles).where(eq(userProfiles.userId,student.userId)).limit(1):[]

      const schedules=await database.db.select({
        id:scheduleImports.id,fileName:scheduleImports.fileName,status:scheduleImports.status,
        parsedJson:scheduleImports.parsedJson,
        updatedAt:scheduleImports.updatedAt,
      }).from(scheduleImports).where(and(
        eq(scheduleImports.studentId,student.id),eq(scheduleImports.status,'parsed')))
        .orderBy(desc(scheduleImports.updatedAt))

      const revisions=await database.db.select({
        id:planRevisions.id,stageCode:planRevisions.stageCode,type:planRevisions.type,
        title:planRevisions.title,status:planRevisions.status,
        itemsJson:planRevisions.itemsJson,createdAt:planRevisions.createdAt,
      }).from(planRevisions).where(eq(planRevisions.studentId,student.id))
        .orderBy(desc(planRevisions.createdAt))

      const linkedUserId=student.userId
      const [growth,history]=linkedUserId?await Promise.all([
        missingOptionalTableAsEmpty(() => database.db.select({
          id:growthRecords.id,type:growthRecords.type,title:growthRecords.title,
          organization:growthRecords.organization,role:growthRecords.role,
          description:growthRecords.description,result:growthRecords.result,
          startDate:growthRecords.startDate,endDate:growthRecords.endDate,
          standardExpression:growthRecords.standardExpression,
          userConfirmed:growthRecords.userConfirmed,
          teacherConfirmed:growthRecords.teacherConfirmed,status:growthRecords.status,
        }).from(growthRecords).where(eq(growthRecords.userId,linkedUserId))
          .orderBy(desc(growthRecords.createdAt))),
        database.db.select({id:assessments.id,status:assessments.status,
          outputJson:assessments.outputJson,
          createdAt:assessments.createdAt,completedAt:assessments.completedAt,
        }).from(assessments).where(eq(assessments.userId,linkedUserId))
          .orderBy(desc(assessments.createdAt)),
      ]):[[],[]]
      // Do not return auth tokens, payment instruments, internal IDs or other students.
      return {
        ok:true,readOnly:true,targetType:'student' as const,
        student:publicStudent,profile:profile||null,
        stages:STAGE_DEFINITIONS,classroom,
        latestSchedule:schedules[0]||null,schedules,
        revisions,growth,assessments:history,
      }
    },
  )

  app.get<{Params:{teacherId:string}}>(
    '/me/read-only/teachers/:teacherId',async(request,reply)=>{
      if(!database.configured)return reply.code(503).send({ok:false,error:'database_not_configured'})
      const operator=await resolveSessionUser(request,database)
      if(!operator)return reply.code(401).send({ok:false,error:'unauthorized'})
      if(!mayViewTeacher(operator.role))
        return reply.code(403).send({ok:false,error:'read_only_target_forbidden'})
      const [teacher]=await database.db.select({
        id:teachers.id,name:teachers.name,title:teachers.title,
        bio:teachers.bio,status:teachers.status,
      }).from(teachers).where(eq(teachers.id,request.params.teacherId)).limit(1)
      if(!teacher)return reply.code(404).send({ok:false,error:'teacher_not_found'})
      const assigned=await database.db.select({
        studentId:students.id,studentName:students.name,
        university:students.university,major:students.major,
        stageCode:studentTeacherAssignments.stageCode,
        relationship:studentTeacherAssignments.relationship,
      }).from(studentTeacherAssignments)
        .innerJoin(students,eq(studentTeacherAssignments.studentId,students.id))
        .where(eq(studentTeacherAssignments.teacherId,teacher.id))
        .orderBy(asc(students.name))
      const pending=assigned.length
        ? await database.db.select({
            id:planRevisions.id,studentId:planRevisions.studentId,
            stageCode:planRevisions.stageCode,type:planRevisions.type,
            title:planRevisions.title,itemsJson:planRevisions.itemsJson,
            createdAt:planRevisions.createdAt,
          }).from(planRevisions).where(and(
            inArray(planRevisions.studentId,assigned.map(item=>item.studentId)),
            eq(planRevisions.status,'pending'),
          )).orderBy(desc(planRevisions.createdAt))
        : []
      return {ok:true,readOnly:true,targetType:'teacher' as const,teacher,assigned,pending}
    },
  )
}
