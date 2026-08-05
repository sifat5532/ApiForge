CREATE TABLE if NOT EXISTS users (
   id serial PRIMARY KEY,
   name VARCHAR(30),
   email VARCHAR(40) UNIQUE CONSTRAINT user_email_check CHECK (email LIKE '%@%'),
   username VARCHAR(40) NOT NULL UNIQUE,
   password_hash VARCHAR(100) NOT NULL,
   dp VARCHAR(30),
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

CREATE TABLE if NOT EXISTS projects (
   id serial PRIMARY KEY,
   author_id INTEGER NOT NULL,
   name VARCHAR(30) NOT NULL,
   description VARCHAR(30),
   api_key_hashed VARCHAR(100) NOT NULL,
   api_key_prefix VARCHAR(30) NOT NULL,
   auth_enabled BOOLEAN,
   created_at TIMESTAMP DEFAULT now (),
   CONSTRAINT fk_project_author FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE
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
   CONSTRAINT fk_project_tags_tag FOREIGN Key (tag_id) REFERENCES tags (id) ON DELETE CASCADE,
   PRIMARY KEY (project_id, tag_id) -- indexes on project id
);

-- indexes on tag id
CREATE INDEX if NOT EXISTS idx_project_tags_tag_id ON project_tags (tag_id);

-- project logs