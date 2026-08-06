CREATE TABLE if NOT EXISTS users (
   id serial PRIMARY KEY,
   name VARCHAR(30),
   email VARCHAR(40) UNIQUE CONSTRAINT user_email_check CHECK (email LIKE '%@%'),
   username VARCHAR(40) NOT NULL UNIQUE,
   password_hash VARCHAR(100) NOT NULL,
   dp VARCHAR(100),
   settings VARCHAR(30) NOT NULL DEFAULT 'Default goes here',
   joined_at TIMESTAMP DEFAULT now ()
);

CREATE TABLE if NOT EXISTS user_sessions (
   id serial PRIMARY KEY,
   user_id INTEGER NOT NULL,
   session_token_hashed VARCHAR(100) NOT NULL,
   device_label VARCHAR(100) NOT NULL,
   ip_address INET NOT NULL,
   created_at TIMESTAMP DEFAULT now (),
   expires_at TIMESTAMP NOT NULL,
   last_active_at TIMESTAMP NOT NULL,
   revoked_at TIMESTAMP,
   CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES Users (id) ON DELETE CASCADE
);

CREATE TABLE if NOT EXISTS notifications (
   id serial PRIMARY KEY,
   sender_id INTEGER,
   receiver_id INTEGER NOT NULL,
   type VARCHAR(15) NOT NULL,
   related_entity_name VARCHAR(20),
   related_entity_id INTEGER,
   data VARCHAR(100),
   read_at TIMESTAMP,
   created_at TIMESTAMP DEFAULT now (),
   CONSTRAINT fk_notification_sender_user FOREIGN KEY (sender_id) REFERENCES Users (id) ON DELETE SET NULL,
   CONSTRAINT fk_notification_receiver_user FOREIGN KEY (receiver_id) REFERENCES Users (id) ON DELETE CASCADE
);

CREATE INDEX if NOT EXISTS idx_notifications_receiver_id ON notifications (receiver_id);

CREATE TABLE if NOT EXISTS projects (
   id serial PRIMARY KEY,
   author_id INTEGER NOT NULL,
   name VARCHAR(30) NOT NULL,
   description VARCHAR(500),
   api_key_hashed VARCHAR(100) NOT NULL,
   api_key_prefix VARCHAR(30) NOT NULL,
   auth_enabled BOOLEAN,
   like_count INTEGER DEFAULT 0,
   avg_rating REAL DEFAULT 0,
   is_template BOOLEAN DEFAULT FALSE,
   is_clone BOOLEAN DEFAULT FALSE,
   created_at TIMESTAMP DEFAULT now (),
   cloned_from_id INTEGER,
   originates_from_id INTEGER,
   CONSTRAINT fk_project_author FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE,
   CONSTRAINT fk_project_cloned_from FOREIGN KEY (cloned_from_id) REFERENCES projects (id) ON DELETE SET NULL,
   CONSTRAINT fk_template_originates_from FOREIGN KEY (originates_from_id) REFERENCES projects (id) ON DELETE SET NULL
);

CREATE TABLE if NOT EXISTS project_cors_origin (
   project_id INTEGER NOT NULL,
   origin VARCHAR(50) NOT NULL,
   created_at TIMESTAMP DEFAULT now (),
   CONSTRAINT fk_cors_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
   PRIMARY KEY (project_id, origin)
);

-- collaborators, schema_table, schema_col, schema_fk
-- api definition, table dependencies, col dependencies
-- api logs
CREATE TABLE if NOT EXISTS tags (
   id serial PRIMARY KEY,
   name VARCHAR(30) NOT NULL UNIQUE
);

CREATE TABLE if NOT EXISTS project_tags (
   project_id INTEGER NOT NULL,
   tag_id INTEGER NOT NULL,
   created_at TIMESTAMP NOT NULL DEFAULT now (),
   CONSTRAINT fk_project_tags_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
   CONSTRAINT fk_project_tags_tag FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE,
   PRIMARY KEY (project_id, tag_id) -- indexes on project id
);

-- indexes on tag id
CREATE INDEX if NOT EXISTS idx_project_tags_tag_id ON project_tags (tag_id);

-- project logs
CREATE TABLE if NOT EXISTS project_logs (
   id serial PRIMARY KEY,
   project_id INTEGER NOT NULL,
   changed_by INTEGER NOT NULL,
   created_at TIMESTAMP NOT NULL DEFAULT now (),
   entity_type VARCHAR(30) NOT NULL,
   entity_id INTEGER NOT NULL,
   change_type VARCHAR(20) NOT NULL,
   old_data JSON,
   new_data JSON,
   CONSTRAINT fk_project_logs_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
   CONSTRAINT fk_project_logs_changed_by FOREIGN KEY (changed_by) REFERENCES users (id) ON DELETE SET NULL
);

-- indexes on (project id,changed_at), (entity_type, entity_id)
CREATE INDEX if NOT EXISTS idx_project_logs_project_id_created_at ON project_logs (project_id, created_at);

CREATE INDEX if NOT EXISTS idx_project_logs_entity_type_entity_id ON project_logs (entity_type, entity_id, created_at DESC);

CREATE TABLE if NOT EXISTS project_collaborators (
   project_id INTEGER NOT NULL,
   user_id INTEGER NOT NULL,
   created_at TIMESTAMP NOT NULL DEFAULT now (),
   role VARCHAR(15) NOT NULL,
   status VARCHAR(15) NOT NULL DEFAULT 'pending',
   CONSTRAINT fk_collaborates_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
   CONSTRAINT fk_collaborates_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
   PRIMARY KEY (project_id, user_id)
);

CREATE INDEX if NOT EXISTS idx_collaborators_user_id ON project_collaborators (user_id);

CREATE TABLE if NOT EXISTS schema_tables (
   id serial PRIMARY KEY,
   project_id INTEGER NOT NULL,
   table_name VARCHAR(30) NOT NULL,
   db_schema_name VARCHAR(30) NOT NULL,
   created_at TIMESTAMP NOT NULL DEFAULT now (),
   CONSTRAINT fk_schema_tables_project_id FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
   CONSTRAINT unique_schema_table_project_id_table_name UNIQUE (project_id, table_name)
);

CREATE TABLE if NOT EXISTS schema_columns (
   id serial PRIMARY KEY,
   schema_table_id INTEGER NOT NULL,
   col_name VARCHAR(30) NOT NULL,
   col_type VARCHAR(20) NOT NULL,
   default_value VARCHAR(30),
   col_length INTEGER,
   is_primary_key BOOLEAN DEFAULT FALSE,
   is_auto_increment BOOLEAN DEFAULT FALSE,
   is_nullable BOOLEAN DEFAULT TRUE,
   is_unique BOOLEAN DEFAULT FALSE,
   created_at TIMESTAMP NOT NULL DEFAULT now (),
   CONSTRAINT fk_schema_columns_schema_table_id FOREIGN KEY (schema_table_id) REFERENCES schema_tables (id) ON DELETE CASCADE,
   CONSTRAINT unique_schema_column_table_id_col_name UNIQUE (schema_table_id, col_name)
);

CREATE TABLE if NOT EXISTS schema_foreign_keys (
   child_col_id INTEGER PRIMARY KEY,
   parent_col_id INTEGER NOT NULL,
   fk_name VARCHAR(30) NOT NULL,
   db_schema_name VARCHAR(30) NOT NULL,
   on_delete VARCHAR(20),
   on_update VARCHAR(20),
   created_at TIMESTAMP NOT NULL DEFAULT now (),
   CONSTRAINT fk_schema_fks_child FOREIGN KEY (child_col_id) REFERENCES schema_columns (id) ON DELETE CASCADE,
   CONSTRAINT fk_schema_fks_parent FOREIGN KEY (parent_col_id) REFERENCES schema_columns (id) ON DELETE CASCADE
);

CREATE TABLE if NOT EXISTS api_definitions (
   id serial PRIMARY KEY,
   name VARCHAR(30) NOT NULL,
   project_id INTEGER NOT NULL,
   METHOD VARCHAR(15) NOT NULL,
   query_definition JSON NOT NULL,
   generated_sql TEXT NOT NULL,
   parameters TEXT,
   is_active BOOLEAN DEFAULT TRUE,
   rate_limit_per_day INTEGER NOT NULL,
   updating_parameters TEXT,
   created_at TIMESTAMP NOT NULL DEFAULT now (),
   CONSTRAINT fk_api_definitions_project_id FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
   CONSTRAINT unique_api_definitions_project_id_name UNIQUE (project_id, name)
);

CREATE INDEX if NOT EXISTS idx_api_definitions ON api_definitions (project_id, name);

CREATE TABLE if NOT EXISTS api_logs (
   id serial PRIMARY KEY,
   api_definition_id INTEGER NOT NULL,
   ip_address INET NOT NULL,
   status_code INTEGER NOT NULL,
   response_time_ms INTEGER NOT NULL,
   created_at TIMESTAMP NOT NULL DEFAULT now (),
   CONSTRAINT fk_api_logs_api_definitions FOREIGN KEY (api_definition_id) REFERENCES api_definitions (id) ON DELETE CASCADE
);

CREATE TABLE if NOT EXISTS api_table_dependencies (
   api_definition_id INTEGER NOT NULL,
   schema_table_id INTEGER NOT NULL,
   usage_context VARCHAR(30),
   created_at TIMESTAMP NOT NULL DEFAULT now (),
   PRIMARY KEY (api_definition_id, schema_table_id),
   CONSTRAINT fk_api_table_dependencies_api_definition_id FOREIGN KEY (api_definition_id) REFERENCES api_definitions (id) ON DELETE CASCADE,
   CONSTRAINT fk_api_table_dependencies_api_schema_table_id FOREIGN KEY (schema_table_id) REFERENCES schema_tables (id) ON DELETE RESTRICT
);

CREATE TABLE if NOT EXISTS api_column_dependencies (
   api_definition_id INTEGER NOT NULL,
   schema_col_id INTEGER NOT NULL,
   usage_context VARCHAR(30),
   created_at TIMESTAMP NOT NULL DEFAULT now (),
   PRIMARY KEY (api_definition_id, schema_col_id),
   CONSTRAINT fk_api_column_dependencies_api_definition_id FOREIGN KEY (api_definition_id) REFERENCES api_definitions (id) ON DELETE CASCADE,
   CONSTRAINT fk_api_column_dependencies_schema_col_id FOREIGN KEY (schema_col_id) REFERENCES schema_columns (id) ON DELETE RESTRICT
);

CREATE TABLE if NOT EXISTS template_clones (
   id serial PRIMARY KEY,
   user_id INTEGER NOT NULL,
   template_id INTEGER NOT NULL,
   cloned_project_id INTEGER,
   created_at TIMESTAMP NOT NULL DEFAULT now (),
   CONSTRAINT fk_template_clones_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
   CONSTRAINT fk_template_clones_template_id FOREIGN KEY (template_id) REFERENCES projects (id) ON DELETE CASCADE
);

CREATE TABLE if NOT EXISTS template_feedback (
   id serial PRIMARY KEY,
   user_id INTEGER NOT NULL,
   template_id INTEGER NOT NULL,
   message TEXT NOT NULL,
   is_read BOOLEAN DEFAULT FALSE,
   created_at TIMESTAMP NOT NULL DEFAULT now (),
   CONSTRAINT fk_template_feedback_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
   CONSTRAINT fk_template_feedback_template_id FOREIGN KEY (template_id) REFERENCES projects (id) ON DELETE CASCADE
);

CREATE INDEX if NOT EXISTS idx_feedback_user_id_template_id ON template_feedback (user_id, template_id);

CREATE TABLE if NOT EXISTS template_ratings (
   user_id INTEGER NOT NULL,
   template_id INTEGER NOT NULL,
   rating INTEGER NOT NULL CONSTRAINT rating_range_check CHECK (rating BETWEEN 1 AND 5),
   review_text TEXT,
   created_at TIMESTAMP NOT NULL DEFAULT now (),
   PRIMARY KEY (user_id, template_id),
   CONSTRAINT fk_template_ratings_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
   CONSTRAINT fk_template_ratings_template_id FOREIGN KEY (template_id) REFERENCES projects (id) ON DELETE CASCADE
);

CREATE TABLE if NOT EXISTS template_likes (
   user_id INTEGER NOT NULL,
   template_id INTEGER NOT NULL,
   created_at TIMESTAMP NOT NULL DEFAULT now (),
   PRIMARY KEY (user_id, template_id),
   CONSTRAINT fk_template_likes_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
   CONSTRAINT fk_template_likes_template_id FOREIGN KEY (template_id) REFERENCES projects (id) ON DELETE CASCADE
);