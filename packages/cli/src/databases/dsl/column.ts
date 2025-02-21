import type { Driver, TableColumnOptions } from '@n8n/typeorm';

export class Column {
	private type:
		| 'int'
		| 'boolean'
		| 'varchar'
		| 'text'
		| 'json'
		| 'timestamp'
		| 'timestamp-no-timezone'
		| 'uuid';

	private isGenerated = false;

	private isNullable = true;

	private isPrimary = false;

	private length: number | 'auto';

	private defaultValue: unknown;

	private primaryKeyConstraintName: string | undefined;

	private commentValue: string | undefined;

	constructor(private name: string) {}

	get bool() {
		this.type = 'boolean';
		return this;
	}

	get int() {
		this.type = 'int';
		return this;
	}

	varchar(length?: number) {
		this.type = 'varchar';
		this.length = length ?? 'auto';
		return this;
	}

	get text() {
		this.type = 'text';
		return this;
	}

	get json() {
		this.type = 'json';
		return this;
	}

	timestamp(msPrecision = 3, convertTimezones = true) {
		this.type = convertTimezones ? 'timestamp' : 'timestamp-no-timezone';
		this.length = msPrecision ?? 'auto';
		return this;
	}

	get uuid() {
		this.type = 'uuid';
		return this;
	}

	get primary() {
		this.isPrimary = true;
		return this;
	}

	primaryWithName(name?: string) {
		this.isPrimary = true;
		this.primaryKeyConstraintName = name;
		return this;
	}

	get notNull() {
		this.isNullable = false;
		return this;
	}

	default(value: unknown) {
		this.defaultValue = value;
		return this;
	}

	get autoGenerate() {
		this.isGenerated = true;
		return this;
	}

	comment(comment: string) {
		this.commentValue = comment;
		return this;
	}

	// eslint-disable-next-line complexity
	toOptions(driver: Driver): TableColumnOptions {
		const { name, type, isNullable, isPrimary, isGenerated, length, primaryKeyConstraintName } =
			this;
		const isMysql = 'mysql' in driver;
		const isPostgres = 'postgres' in driver;
		const isSqlite = 'sqlite' in driver;

		const options: TableColumnOptions = {
			primaryKeyConstraintName,
			name,
			isNullable,
			isPrimary,
			type,
		};

		if (options.type === 'int' && isSqlite) {
			options.type = 'integer';
		} else if (type === 'boolean' && isMysql) {
			options.type = 'tinyint(1)';
		} else if (type === 'timestamp') {
			options.type = isPostgres ? 'timestamptz' : 'datetime';
		} else if (type === 'timestamp-no-timezone') {
			options.type = isPostgres ? 'timestamp' : 'datetime';
		} else if (type === 'json' && isSqlite) {
			options.type = 'text';
		} else if (type === 'uuid') {
			// mysql does not support uuid type
			if (isMysql) options.type = 'varchar(36)';
			// we haven't been defining length on "uuid" varchar on sqlite
			if (isSqlite) options.type = 'varchar';
		}

		if ((type === 'varchar' || type === 'timestamp') && length !== 'auto') {
			options.type = `${options.type}(${length})`;
		}

		if (isGenerated) {
			options.isGenerated = true;
			options.generationStrategy = type === 'uuid' ? 'uuid' : 'increment';
		}

		if (isPrimary || isGenerated) {
			options.isNullable = false;
		}

		if (this.defaultValue !== undefined) {
			if (type === 'timestamp' && this.defaultValue === 'NOW()') {
				options.default = isSqlite
					? "STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')"
					: 'CURRENT_TIMESTAMP(3)';
			} else {
				options.default = this.defaultValue;
			}
		}

		if (this.commentValue) {
			options.comment = this.commentValue;
		}

		return options;
	}
}
