from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0017_bracket_col'),
    ]

    operations = [
        migrations.AddField(
            model_name='match',
            name='is_final',
            field=models.BooleanField(default=False),
        ),
    ]
