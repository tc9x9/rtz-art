from django.db import models
from django.urls import reverse


class Auction(models.Model):
    name = models.CharField(max_length=200)
    min_price = models.PositiveIntegerField()
    num_fractions = models.PositiveIntegerField(default=10000)

    def __str__(self):
        return self.name

    def get_absolute_url(self):
        return reverse("auctions:detail", kwargs={"pk": self.pk})

    @property
    def results(self):
        all_bids = list(self.bid_set.all())

        if len(all_bids) == 0:
            return "-"

        for b in all_bids:
            b.is_accepted = False
            b.given_fractions = 0
            b.weight = 0

        min_price = self.min_price

        while True:
            accepted_bids = [b for b in all_bids if b.max_fraction_price >= min_price]
            num_potential_fractions = sum([b.max_investment / min_price for b in accepted_bids])

            if num_potential_fractions < self.num_fractions:
                break

            min_price += 1

        while True:
            accepted_bids = [b for b in all_bids if b.max_fraction_price >= min_price]
            num_potential_fractions = sum([b.max_investment / min_price for b in accepted_bids])

            if num_potential_fractions >= self.num_fractions:
                break

            min_price -= 0.1

        if min_price < self.min_price:
            return "Too small bids to finish auction"

        
        for b in accepted_bids:
            b.factor = b.max_investment * b.max_fraction_price
            b.is_accepted = True

        sum_factors = sum([b.factor for b in accepted_bids])

        for b in accepted_bids:
            b.weight = b.factor / sum_factors
            b.given_fractions = int(self.num_fractions * b.weight)

        sorted_bids = sorted(accepted_bids, key=lambda b: b.given_fractions, reverse=True)

        sum_fractions = sum([b.given_fractions for b in accepted_bids])
        rest = self.num_fractions - sum_fractions

        first_bidder = sorted_bids[0]
        first_bidder.given_fractions += rest

        return f"Final price per fraction: {min_price:.2f}\nBidders:\n" + "\n".join([f"Bidder {b.id} (weight: {b.weight:.4f}, fractions: {b.given_fractions}), accepted?: {b.is_accepted}" for b in all_bids])

class Bid(models.Model):
    auction = models.ForeignKey(Auction, on_delete=models.CASCADE)
    max_fraction_price = models.PositiveIntegerField()
    max_investment = models.PositiveIntegerField()

    @property
    def received_fractions(self):
        return self.given_fractions or "-"

    def __str__(self):
        return f"Bid {self.id}"