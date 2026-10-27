import {z} from 'zod';
import {staffSchema} from '../platform/contracts';
// The private SQL JSON serializer strips null properties recursively. Restore
// only the explicitly nullable scope/expiry fields before canonical validation.
// Required identity, role code and validity-start fields stay mandatory.
export const privateProfileSchema=staffSchema.extend({
 memberships:z.array(staffSchema.shape.memberships.element.extend({until:staffSchema.shape.memberships.element.shape.until.optional().default(null)})),
 roles:z.array(staffSchema.shape.roles.element.extend({bureauId:staffSchema.shape.roles.element.shape.bureauId.optional().default(null),until:staffSchema.shape.roles.element.shape.until.optional().default(null)})),
});
