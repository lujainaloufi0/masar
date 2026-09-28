import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Validates a request body against a zod schema and returns the parsed value. */
export class ZodPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}
  transform(value: unknown): T {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new BadRequestException({
        code: 'invalid',
        fields: Object.fromEntries(r.error.issues.map((i) => [i.path.join('.') || '_', i.message])),
      });
    }
    return r.data;
  }
}
