export PGHOST=localhost
export PGPORT=5432
export PGUSER=postgres
export PGPASSWORD=postgres
export PGDATABASE=packo

if  ! psql -lqt | cut -d \| -f 1 | grep -qw $PGDATABASE; then
    createdb packo
    psql -f sql/packo.sql
fi
